let authFetchInterceptorInstalled = false;

export const installAuthFetchInterceptor = () => {
  if (authFetchInterceptorInstalled) return;
  const originalFetch = window.fetch;
  window.fetch = async (url, options = {}) => {
    const token = localStorage.getItem('mycloud_token');
    if (token) {
      options.headers = {
        ...options.headers,
        Authorization: `Bearer ${token}`
      };
    }
    return originalFetch(url, options);
  };
  authFetchInterceptorInstalled = true;
};

export const authUrl = (endpoint, path) => {
  const params = new URLSearchParams({ path });
  const token = localStorage.getItem('mycloud_token');
  if (token) params.set('token', token);
  return `${endpoint}?${params.toString()}`;
};
