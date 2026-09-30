import axios from 'axios';

// Create an Axios instance with the dynamic base URL
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request Interceptor: Runs BEFORE every request is sent
apiClient.interceptors.request.use(
  (config) => {
    // Check local storage for a login token
    const token = localStorage.getItem('token');
    if (token) {
      // If logged in, attach the token to the Authorization header
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response Interceptor: Runs AFTER a response is received, before your components see it
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    if (error.response) {
      const { status } = error.response;
      
      // Global error handling based on HTTP status codes
      if (status === 401) {
        console.error('Unauthorized: Please log in again.');
        // Optional: Force a logout or redirect to /login here
      } else if (status === 403) {
        console.error('Forbidden: You do not have permission for this action.');
      } else if (status === 500) {
        console.error('Server Error: The backend crashed or is unreachable.');
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;