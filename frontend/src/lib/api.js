const API_URL = import.meta.env.VITE_API_URL !== undefined ? import.meta.env.VITE_API_URL : (import.meta.env.MODE === "production" ? "" : "http://localhost:4000");

/**
 * Wrapper around fetch that:
 * 1. Prepends the API base URL
 * 2. Attaches the JWT from localStorage as a Bearer token
 * 3. Sets Content-Type for JSON bodies
 * 4. Parses the response safely
 */
export async function apiFetch(path, options = {}) {
  const token = localStorage.getItem("archon_token");

  const headers = {
    ...options.headers,
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  if (options.body && typeof options.body === "object") {
    headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(options.body);
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  let data = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    const error = new Error(data.error || data.message || `Request failed (${response.status})`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}
