// Package webui exposes the embedded frontend distribution files.
package webui

import "embed"

//go:embed all:dist
var FS embed.FS
