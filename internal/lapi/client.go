package lapi

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
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

// alertForDecisions is used only to extract the embedded decisions slice.
type alertForDecisions struct {
	Decisions []json.RawMessage `json:"decisions"`
}

// FetchDecisions extracts active decisions embedded in alerts via the watcher JWT endpoint.
// GET /v1/decisions requires a bouncer X-Api-Key; decisions are available inside
// every alert object returned by GET /v1/alerts. We filter by the decision's
// "until" field to return only currently active (non-expired) decisions.
func (c *Client) FetchDecisions(ip string) ([]json.RawMessage, error) {
	params := url.Values{}
	params.Set("limit", "0")
	params.Set("include_capi", "false")
	params.Set("since", "8760h") // 1 year — wide enough to catch all active decisions
	if ip != "" {
		params.Set("ip", ip)
	}

	data, status, err := c.doRequest(http.MethodGet, "/v1/alerts?"+params.Encode(), nil)
	if err != nil {
		return nil, err
	}
	if status == http.StatusNotFound {
		return []json.RawMessage{}, nil
	}
	if status != http.StatusOK {
		return nil, fmt.Errorf("fetch decisions: unexpected status %d", status)
	}

	var alerts []alertForDecisions
	if err := json.Unmarshal(data, &alerts); err != nil {
		return nil, fmt.Errorf("fetch decisions: decode alerts: %w", err)
	}

	// Collect only active decisions, deduplicating by ID.
	// LAPI returns duration as a relative string: positive ("3h59m10s") = active,
	// negative ("-13m24s") = expired.
	seen := make(map[int64]struct{})
	var decisions []json.RawMessage
	for _, alert := range alerts {
		for _, raw := range alert.Decisions {
			var d struct {
				ID       int64  `json:"id"`
				Duration string `json:"duration"`
			}
			if err := json.Unmarshal(raw, &d); err != nil || d.ID == 0 {
				continue
			}
			// Skip expired decisions (negative duration).
			if strings.HasPrefix(d.Duration, "-") {
				continue
			}
			if _, ok := seen[d.ID]; ok {
				continue
			}
			seen[d.ID] = struct{}{}
			decisions = append(decisions, raw)
		}
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

type ScenarioStat struct {
	Scenario string `json:"scenario"`
	Count    int    `json:"count"`
}

type CountryStat struct {
	Country string `json:"country"`
	Count   int    `json:"count"`
}

type IPStat struct {
	IP    string `json:"ip"`
	Count int    `json:"count"`
}

type AllowlistItem struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	CreatedAt   string `json:"created_at"`
	UpdatedAt   string `json:"updated_at"`
	Size        int    `json:"size"`
}

type InfoResult struct {
	TotalAlerts     int             `json:"total_alerts"`
	ActiveDecisions int             `json:"active_decisions"`
	TopScenarios    []ScenarioStat  `json:"top_scenarios"`
	TopCountries    []CountryStat   `json:"top_countries"`
	TopIPs          []IPStat        `json:"top_ips"`
	Allowlists      []AllowlistItem `json:"allowlists"`
	UIVersion       string          `json:"ui_version"`
	UIUptime        string          `json:"ui_uptime"`
}

type alertForInfo struct {
	Scenario string `json:"scenario"`
	Source   struct {
		CN    string `json:"cn"`
		IP    string `json:"ip"`
		Value string `json:"value"`
	} `json:"source"`
	Decisions []struct {
		Duration string `json:"duration"`
	} `json:"decisions"`
}

type allowlistRaw struct {
	Name        string            `json:"name"`
	Description string            `json:"description"`
	CreatedAt   string            `json:"created_at"`
	UpdatedAt   string            `json:"updated_at"`
	Items       []json.RawMessage `json:"items"`
}

// FetchInfo computes aggregate stats from alerts and fetches allowlists.
func (c *Client) FetchInfo() (*InfoResult, error) {
	// 1. Fetch all alerts (1 year window)
	params := url.Values{}
	params.Set("limit", "0")
	params.Set("include_capi", "false")
	params.Set("since", "8760h")

	data, status, err := c.doRequest(http.MethodGet, "/v1/alerts?"+params.Encode(), nil)
	if err != nil {
		return nil, err
	}
	if status != http.StatusOK {
		return nil, fmt.Errorf("fetch info alerts: unexpected status %d", status)
	}

	var alerts []alertForInfo
	if err := json.Unmarshal(data, &alerts); err != nil {
		return nil, fmt.Errorf("fetch info: decode alerts: %w", err)
	}

	// 2. Compute stats
	totalAlerts := len(alerts)
	activeDecisions := 0
	scenarioCounts := make(map[string]int)
	countryCounts := make(map[string]int)
	ipCounts := make(map[string]int)

	for _, a := range alerts {
		for _, d := range a.Decisions {
			if !strings.HasPrefix(d.Duration, "-") {
				activeDecisions++
			}
		}
		if a.Scenario != "" {
			scenarioCounts[a.Scenario]++
		}
		if a.Source.CN != "" {
			countryCounts[a.Source.CN]++
		}
		ip := a.Source.IP
		if ip == "" {
			ip = a.Source.Value
		}
		if ip != "" {
			ipCounts[ip]++
		}
	}

	topScenarios := topNScenarios(scenarioCounts, 5)
	topCountries := topNCountries(countryCounts, 5)
	topIPs := topNIPs(ipCounts, 5)

	// 3. Fetch allowlists
	allowlists, err := c.fetchAllowlists()
	if err != nil {
		return nil, err
	}

	return &InfoResult{
		TotalAlerts:     totalAlerts,
		ActiveDecisions: activeDecisions,
		TopScenarios:    topScenarios,
		TopCountries:    topCountries,
		TopIPs:          topIPs,
		Allowlists:      allowlists,
	}, nil
}

func (c *Client) fetchAllowlists() ([]AllowlistItem, error) {
	data, status, err := c.doRequest(http.MethodGet, "/v1/allowlists", nil)
	if err != nil {
		return []AllowlistItem{}, nil
	}
	if status == http.StatusNotFound {
		return []AllowlistItem{}, nil
	}
	if status != http.StatusOK {
		return []AllowlistItem{}, nil
	}

	var raws []allowlistRaw
	if err := json.Unmarshal(data, &raws); err != nil {
		return []AllowlistItem{}, nil
	}

	result := make([]AllowlistItem, 0, len(raws))
	for _, r := range raws {
		result = append(result, AllowlistItem{
			Name:        r.Name,
			Description: r.Description,
			CreatedAt:   r.CreatedAt,
			UpdatedAt:   r.UpdatedAt,
			Size:        len(r.Items),
		})
	}
	return result, nil
}

func topNScenarios(counts map[string]int, n int) []ScenarioStat {
	type kv struct {
		k string
		v int
	}
	list := make([]kv, 0, len(counts))
	for k, v := range counts {
		list = append(list, kv{k, v})
	}
	sortDesc(len(list), func(i, j int) bool { return list[i].v > list[j].v }, func(i, j int) { list[i], list[j] = list[j], list[i] })
	if n > len(list) {
		n = len(list)
	}
	result := make([]ScenarioStat, n)
	for i := 0; i < n; i++ {
		result[i] = ScenarioStat{Scenario: list[i].k, Count: list[i].v}
	}
	return result
}

func topNCountries(counts map[string]int, n int) []CountryStat {
	type kv struct {
		k string
		v int
	}
	list := make([]kv, 0, len(counts))
	for k, v := range counts {
		list = append(list, kv{k, v})
	}
	sortDesc(len(list), func(i, j int) bool { return list[i].v > list[j].v }, func(i, j int) { list[i], list[j] = list[j], list[i] })
	if n > len(list) {
		n = len(list)
	}
	result := make([]CountryStat, n)
	for i := 0; i < n; i++ {
		result[i] = CountryStat{Country: list[i].k, Count: list[i].v}
	}
	return result
}

func topNIPs(counts map[string]int, n int) []IPStat {
	type kv struct {
		k string
		v int
	}
	list := make([]kv, 0, len(counts))
	for k, v := range counts {
		list = append(list, kv{k, v})
	}
	sortDesc(len(list), func(i, j int) bool { return list[i].v > list[j].v }, func(i, j int) { list[i], list[j] = list[j], list[i] })
	if n > len(list) {
		n = len(list)
	}
	result := make([]IPStat, n)
	for i := 0; i < n; i++ {
		result[i] = IPStat{IP: list[i].k, Count: list[i].v}
	}
	return result
}

// sortDesc is a simple insertion sort helper (avoids importing sort for small slices).
func sortDesc(n int, less func(i, j int) bool, swap func(i, j int)) {
	for i := 1; i < n; i++ {
		for j := i; j > 0 && less(j, j-1); j-- {
			swap(j, j-1)
		}
	}
}
