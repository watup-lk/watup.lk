package handlers

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/watup-lk/search-service/internal/repository"
)

type fakeSearcher struct {
	result repository.SearchResult
	err    error
}

func (f *fakeSearcher) Search(_ context.Context, _ repository.SearchFilter) (repository.SearchResult, error) {
	return f.result, f.err
}

func TestSearch_OK(t *testing.T) {
	h := &SearchHandler{repo: &fakeSearcher{result: repository.SearchResult{
		Results:    []repository.Result{},
		Pagination: repository.Pagination{Total: 0, Page: 1, Limit: 20, Pages: 0},
	}}}
	req := httptest.NewRequest(http.MethodGet, "/search", nil)
	w := httptest.NewRecorder()
	h.Search(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
}

func TestSearch_WithQueryParams(t *testing.T) {
	h := &SearchHandler{repo: &fakeSearcher{result: repository.SearchResult{}}}
	req := httptest.NewRequest(http.MethodGet, "/search?role=engineer&page=2&limit=10", nil)
	w := httptest.NewRecorder()
	h.Search(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
}

func TestSearch_RepoError(t *testing.T) {
	h := &SearchHandler{repo: &fakeSearcher{err: errors.New("db error")}}
	req := httptest.NewRequest(http.MethodGet, "/search", nil)
	w := httptest.NewRecorder()
	h.Search(w, req)
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", w.Code)
	}
}

func TestParseIntClamped(t *testing.T) {
	cases := []struct {
		s        string
		def, min, max int
		want     int
	}{
		{"", 1, 1, 100, 1},
		{"5", 1, 1, 100, 5},
		{"0", 1, 1, 100, 1},
		{"200", 1, 1, 100, 100},
		{"abc", 1, 1, 100, 1},
	}
	for _, c := range cases {
		got := parseIntClamped(c.s, c.def, c.min, c.max)
		if got != c.want {
			t.Errorf("parseIntClamped(%q,%d,%d,%d) = %d, want %d", c.s, c.def, c.min, c.max, got, c.want)
		}
	}
}
