import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";
import { apiMessage } from "../../lib/errors";
import type { SearchInput, SearchResult } from "../../domain/types";

export type SearchFilters = Omit<SearchInput, "query">;

export interface UseSearchOptions {
  query: string;
  filters?: SearchFilters;
  enabled?: boolean;
  debounceMs?: number;
}

export interface UseSearchState {
  results: SearchResult[];
  loading: boolean;
  error: string | null;
  lastQuery: string | null;
}

const DEFAULT_DEBOUNCE_MS = 250;

export function useSearch({
  query,
  filters,
  enabled = true,
  debounceMs = DEFAULT_DEBOUNCE_MS,
}: UseSearchOptions): UseSearchState {
  const [state, setState] = useState<UseSearchState>({
    results: [],
    loading: false,
    error: null,
    lastQuery: null,
  });
  const requestIdRef = useRef(0);

  const trimmed = query.trim();

  useEffect(() => {
    if (!enabled || !trimmed) {
      requestIdRef.current += 1;
      setState({ results: [], loading: false, error: null, lastQuery: null });
      return;
    }

    const handle = window.setTimeout(() => {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;

      setState((current) => ({ ...current, loading: true, error: null }));

      api
        .search({ query: trimmed, ...(filters ?? {}) })
        .then((response) => {
          if (requestIdRef.current !== requestId) return;
          setState({
            results: response.results,
            loading: false,
            error: null,
            lastQuery: trimmed,
          });
        })
        .catch((err: unknown) => {
          if (requestIdRef.current !== requestId) return;
          setState({
            results: [],
            loading: false,
            error: apiMessage(err),
            lastQuery: trimmed,
          });
        });
    }, debounceMs);

    return () => {
      window.clearTimeout(handle);
    };
  }, [trimmed, filters, enabled, debounceMs]);

  return state;
}
