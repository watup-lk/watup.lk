package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/watup-lk/search-service/internal/repository"
)

type fakeSearcher struct {
	result repository.SearchResult
	err    error
	filter repository.SearchFilter
}

func (f *fakeSearcher) Search(_ context.Context, filter repository.SearchFilter) (repository.SearchResult, error) {
	f.filter = filter
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
	searcher := &fakeSearcher{result: repository.SearchResult{
		Results:    []repository.Result{{ID: "sub-1", Role: "Backend Engineer", Country: "LK"}},
		Pagination: repository.Pagination{Total: 1, Page: 2, Limit: 10, Pages: 1},
	}}
	h := &SearchHandler{repo: searcher}
	req := httptest.NewRequest(
		http.MethodGet,
		"/search?role=engineer&company=Acme&country=lk&experience_level=senior&query=backend&page=2&limit=10",
		nil,
	)
	w := httptest.NewRecorder()
	h.Search(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	want := repository.SearchFilter{
		Role:            "engineer",
		Company:         "Acme",
		Country:         "lk",
		ExperienceLevel: "senior",
		Query:           "backend",
		Status:          "",
		Page:            2,
		Limit:           10,
	}
	if searcher.filter != want {
		t.Fatalf("unexpected filter: got %#v want %#v", searcher.filter, want)
	}

	var body repository.SearchResult
	if err := json.NewDecoder(w.Body).Decode(&body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(body.Results) != 1 || body.Results[0].ID != "sub-1" {
		t.Fatalf("unexpected response body: %#v", body)
	}
}

func TestSearch_ForwardsStatusFilter(t *testing.T) {
	searcher := &fakeSearcher{result: repository.SearchResult{}}
	h := &SearchHandler{repo: searcher}
	req := httptest.NewRequest(http.MethodGet, "/search?status=PENDING", nil)
	w := httptest.NewRecorder()

	h.Search(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	if searcher.filter.Status != "PENDING" {
		t.Fatalf("expected status PENDING, got %q", searcher.filter.Status)
	}
}

func TestSearch_ClampsPaginationDefaults(t *testing.T) {
	searcher := &fakeSearcher{result: repository.SearchResult{}}
	h := &SearchHandler{repo: searcher}
	req := httptest.NewRequest(http.MethodGet, "/search?page=-2&limit=500", nil)
	w := httptest.NewRecorder()

	h.Search(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	if searcher.filter.Page != 1 {
		t.Fatalf("expected page 1, got %d", searcher.filter.Page)
	}
	if searcher.filter.Limit != 100 {
		t.Fatalf("expected limit 100, got %d", searcher.filter.Limit)
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
		s             string
		def, min, max int
		want          int
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
