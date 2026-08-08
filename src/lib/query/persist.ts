import { QueryClient, dehydrate, hydrate } from '@tanstack/react-query'

const CACHE_KEY = 'rango-query-cache'
const CACHE_VERSION = 2
const MAX_AGE = 1000 * 60 * 60 * 24 // 24h
const MAX_STORAGE_BYTES = 1_500_000
const PERSISTED_QUERY_ROOTS = new Set([
  'sessionUser',
  'users',
  'restaurants',
  'reviews',
  'groups',
  'lists',
])

interface PersistedCache {
  version: number
  timestamp: number
  state: ReturnType<typeof dehydrate>
}

function hasInlineImage(value: unknown): boolean {
  if (typeof value === 'string') return value.startsWith('data:image/')
  if (Array.isArray(value)) return value.some(hasInlineImage)
  if (!value || typeof value !== 'object') return false
  return Object.values(value).some(hasInlineImage)
}

/**
 * Builds the app QueryClient with offline persistence.
 *
 * The successful query cache is mirrored to localStorage (debounced) and rehydrated
 * synchronously on startup, so reloading the PWA while offline still paints the last
 * feed/ranking the user saw. Native webviews share the same localStorage, so this
 * works there too.
 */
export function createPersistedQueryClient(): QueryClient {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        retry: 1,
        // Keep cached data around long enough to survive reloads (offline support).
        gcTime: MAX_AGE,
        staleTime: 1000 * 30,
      },
    },
  })

  // Hydrate synchronously so an offline reload renders the cached feed immediately.
  restoreCache(queryClient)

  // Persist on every cache settle, debounced to avoid thrashing localStorage.
  let saveTimer: ReturnType<typeof setTimeout> | undefined
  queryClient.getQueryCache().subscribe(() => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => saveCache(queryClient), 1000)
  })

  return queryClient
}

function restoreCache(queryClient: QueryClient): void {
  if (typeof localStorage === 'undefined') return
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as PersistedCache
    if (
      parsed.version !== CACHE_VERSION ||
      Date.now() - parsed.timestamp > MAX_AGE
    ) {
      localStorage.removeItem(CACHE_KEY)
      return
    }
    hydrate(queryClient, parsed.state)
  } catch {
    try {
      localStorage.removeItem(CACHE_KEY)
    } catch {
      /* ignore */
    }
  }
}

function saveCache(queryClient: QueryClient): void {
  if (typeof localStorage === 'undefined') return
  try {
    const state = dehydrate(queryClient, {
      shouldDehydrateQuery: (query) =>
        query.state.status === 'success' &&
        PERSISTED_QUERY_ROOTS.has(String(query.queryKey[0])) &&
        !hasInlineImage(query.state.data),
    })
    let payload: PersistedCache = {
      version: CACHE_VERSION,
      timestamp: Date.now(),
      state,
    }

    let serialized = JSON.stringify(payload)
    // Reviews can contain user-selected inline images when Storage is offline.
    // Keep the lightweight app cache useful instead of repeatedly hitting the
    // localStorage quota with a multi-megabyte snapshot.
    if (serialized.length > MAX_STORAGE_BYTES) {
      payload = {
        ...payload,
        state: {
          ...state,
          queries: state.queries.filter(
            (query) => query.queryKey[0] !== 'reviews'
          ),
        },
      }
      serialized = JSON.stringify(payload)
    }

    if (serialized.length <= MAX_STORAGE_BYTES) {
      localStorage.setItem(CACHE_KEY, serialized)
    }
  } catch {
    /* quota / serialization issue — skip this save */
  }
}
