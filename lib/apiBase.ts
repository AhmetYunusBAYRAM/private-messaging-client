const API_BASE =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
    ? "http://localhost:5032"
    : typeof window !== "undefined"
    ? window.location.origin
    : "http://localhost:5032";

export default API_BASE;
