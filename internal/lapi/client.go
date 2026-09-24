package lapi

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sync"
	"time"
)

// Client is a CrowdSec LAPI client.
type Client struct {
	baseURL       string
	username      string
	password      string
	token         string
	httpClient    *http.Client
	mu            sync.Mutex
	skipTLSVerify bool
}

// NewClient creates a new LAPI client.
func NewClient(baseURL, username, password string, skipTLSVerify bool) *Client {
	transport := &http.Transport{
		TLSClientConfig: &tls.Config{
			InsecureSkipVerify: skipTLSVerify,
		},
	}
	return &Client{
		baseURL:       baseURL,
		username:      username,
		password:      password,
		skipTLSVerify: skipTLSVerify,
		httpClient: &http.Client{
			Timeout:   30 * time.Second,
			Transport: transport,
		},
	}
}

type loginRequest struct {
	MachineID string   `json:"machine_id"`
	Password  string   `json:"password"`
	Scenarios []string `json:"scenarios"`
}

type loginResponse struct {
	Token string `json:"token"`
}

func (c *Client) login() error {
	body, err := json.Marshal(loginRequest{
		MachineID: c.username,
		Password:  c.password,
		Scenarios: []string{"manual/web-ui"},
	})
	if err != nil {
		return fmt.Errorf("login: marshal request: %w", err)
	}

	req, err := http.NewRequest(http.MethodPost, c.baseURL+"/v1/watchers/login", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("login: create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("login: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("login: unexpected status %d", resp.StatusCode)
	}

	var lr loginResponse
	if err := json.NewDecoder(resp.Body).Decode(&lr); err != nil {
		return fmt.Errorf("login: decode response: %w", err)
	}

	c.mu.Lock()
	c.token = lr.Token
	c.mu.Unlock()
	return nil
}

func (c *Client) doRequest(method, path string, body io.Reader) ([]byte, int, error) {
	// Read body bytes upfront so we can replay on 401 retry.
	var bodyBytes []byte
	if body != nil {
		var err error
		bodyBytes, err = io.ReadAll(body)
		if err != nil {
			return nil, 0, fmt.Errorf("read request body: %w", err)
		}
	}

	c.mu.Lock()
	token := c.token
	c.mu.Unlock()

	newBody := func() io.Reader {
		if bodyBytes == nil {
			return nil
		}
		return bytes.NewReader(bodyBytes)
	}

	data, status, err := c.rawRequest(method, path, newBody(), token)
	if err != nil {
		return nil, status, err
	}

	if status == http.StatusUnauthorized {
		if err := c.login(); err != nil {
			return nil, status, fmt.Errorf("re-auth failed: %w", err)
		}
		c.mu.Lock()
		token = c.token
		c.mu.Unlock()
		data, status, err = c.rawRequest(method, path, newBody(), token)
		if err != nil {
			return nil, status, err
		}
	}

	return data, status, nil
}

func (c *Client) rawRequest(method, path string, body io.Reader, token string) ([]byte, int, error) {
	req, err := http.NewRequest(method, c.baseURL+path, body)
	if err != nil {
		return nil, 0, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, 0, fmt.Errorf("do request: %w", err)
	}
	defer resp.Body.Close()

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, resp.StatusCode, fmt.Errorf("read response: %w", err)
	}

	return data, resp.StatusCode, nil
}

// Heartbeat checks if the LAPI is reachable.
func (c *Client) Heartbeat() error {
	_, status, err := c.doRequest(http.MethodGet, "/v1/heartbeat", nil)
	if err != nil {
		return err
	}
	if status != http.StatusOK {
		return fmt.Errorf("heartbeat: unexpected status %d", status)
	}
	return nil
}

// FetchAlerts retrieves alerts from the LAPI.
func (c *Client) FetchAlerts(since, ip, scenario string) ([]json.RawMessage, error) {
	params := url.Values{}
	params.Set("limit", "0")
	params.Set("include_capi", "false")
	if since != "" {
		params.Set("since", since)
	}
	if ip != "" {
		params.Set("ip", ip)
	}
	if scenario != "" {
		params.Set("scenario", scenario)
	}

	path := "/v1/alerts?" + params.Encode()
	data, status, err := c.doRequest(http.MethodGet, path, nil)
	if err != nil {
		return nil, err
	}
	if status != http.StatusOK {
		return nil, fmt.Errorf("fetch alerts: unexpected status %d", status)
	}

	var alerts []json.RawMessage
	if err := json.Unmarshal(data, &alerts); err != nil {
		return nil, fmt.Errorf("fetch alerts: decode response: %w", err)
	}
	return alerts, nil
}

// FetchAlertByID retrieves a single alert by ID.
func (c *Client) FetchAlertByID(id string) (json.RawMessage, error) {
	data, status, err := c.doRequest(http.MethodGet, "/v1/alerts/"+id, nil)
	if err != nil {
		return nil, err
	}
	if status != http.StatusOK {
		return nil, fmt.Errorf("fetch alert %s: unexpected status %d", id, status)
	}
	return json.RawMessage(data), nil
}

// FetchDecisions retrieves decisions from the LAPI.
func (c *Client) FetchDecisions(ip string) ([]json.RawMessage, error) {
	params := url.Values{}
	params.Set("limit", "0")
	if ip != "" {
		params.Set("ip", ip)
	}

	path := "/v1/decisions?" + params.Encode()
	data, status, err := c.doRequest(http.MethodGet, path, nil)
	if err != nil {
		return nil, err
	}
	if status == http.StatusNotFound {
		// LAPI returns 404 when there are no decisions
		return []json.RawMessage{}, nil
	}
	if status != http.StatusOK {
		return nil, fmt.Errorf("fetch decisions: unexpected status %d", status)
	}

	var decisions []json.RawMessage
	if err := json.Unmarshal(data, &decisions); err != nil {
		return nil, fmt.Errorf("fetch decisions: decode response: %w", err)
	}
	if decisions == nil {
		return []json.RawMessage{}, nil
	}
	return decisions, nil
}

type decisionPayload struct {
	Type     string `json:"type"`
	Duration string `json:"duration"`
	Value    string `json:"value"`
	Origin   string `json:"origin"`
	Scenario string `json:"scenario"`
	Scope    string `json:"scope"`
}

type sourcePayload struct {
	Scope string `json:"scope"`
	Value string `json:"value"`
}

type alertPayload struct {
	Scenario        string            `json:"scenario"`
	CampaignName    string            `json:"campaign_name"`
	Message         string            `json:"message"`
	EventsCount     int               `json:"events_count"`
	StartAt         string            `json:"start_at"`
	StopAt          string            `json:"stop_at"`
	Capacity        int               `json:"capacity"`
	Leakspeed       string            `json:"leakspeed"`
	Simulated       bool              `json:"simulated"`
	Events          []json.RawMessage `json:"events"`
	ScenarioHash    string            `json:"scenario_hash"`
	ScenarioVersion string            `json:"scenario_version"`
	Source          sourcePayload     `json:"source"`
	Decisions       []decisionPayload `json:"decisions"`
}

// AddDecision creates a new decision via the LAPI.
func (c *Client) AddDecision(ip, duration, reason, decType string) error {
	now := time.Now().UTC().Format(time.RFC3339)
	payload := []alertPayload{
		{
			Scenario:        "manual/web-ui",
			CampaignName:    "manual/web-ui",
			Message:         "Manual ban from CrowdSec Lite UI: " + reason,
			EventsCount:     1,
			StartAt:         now,
			StopAt:          now,
			Capacity:        0,
			Leakspeed:       "0",
			Simulated:       false,
			Events:          []json.RawMessage{},
			ScenarioHash:    "",
			ScenarioVersion: "",
			Source: sourcePayload{
				Scope: "ip",
				Value: ip,
			},
			Decisions: []decisionPayload{
				{
					Type:     decType,
					Duration: duration,
					Value:    ip,
					Origin:   "cscli",
					Scenario: "manual/web-ui",
					Scope:    "ip",
				},
			},
		},
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("add decision: marshal payload: %w", err)
	}

	_, status, err := c.doRequest(http.MethodPost, "/v1/alerts", bytes.NewReader(body))
	if err != nil {
		return err
	}
	if status != http.StatusOK && status != http.StatusCreated {
		return fmt.Errorf("add decision: unexpected status %d", status)
	}
	return nil
}

// DeleteDecision removes a decision by ID.
func (c *Client) DeleteDecision(id string) error {
	_, status, err := c.doRequest(http.MethodDelete, "/v1/decisions/"+id, nil)
	if err != nil {
		return err
	}
	if status != http.StatusOK && status != http.StatusNoContent {
		return fmt.Errorf("delete decision %s: unexpected status %d", id, status)
	}
	return nil
}
