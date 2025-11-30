"""
Base API client for HTTP requests with common error handling.
"""

import requests
import logging
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)


class APIClient:
    """Base class for API clients with common HTTP request methods."""

    def __init__(self, base_url: str, api_key: str, name: str = "API"):
        """
        Initialize API client.

        Args:
            base_url: Base URL for the API
            api_key: API key for authentication
            name: Name of the service (for logging)
        """
        self.base_url = base_url.rstrip('/')
        self.api_key = api_key
        self.name = name

        # Use session for connection pooling and performance
        self.session = requests.Session()
        self.session.headers.update({
            'X-Api-Key': self.api_key,
            'Content-Type': 'application/json'
        })

    def _request(self, method: str, endpoint: str, **kwargs) -> Any:
        """
        Make HTTP request with common error handling.

        Args:
            method: HTTP method (GET, POST, PUT, DELETE)
            endpoint: API endpoint (without base URL)
            **kwargs: Additional arguments to pass to requests

        Returns:
            Response JSON if successful

        Raises:
            requests.exceptions.RequestException: On any request failure
        """
        url = f"{self.base_url}/{endpoint.lstrip('/')}"

        # Allow overriding default headers if needed
        headers = kwargs.pop('headers', None)
        if headers is not None:
            # Merge with session headers (explicit headers take precedence)
            merged_headers = self.session.headers.copy()
            merged_headers.update(headers)
            kwargs['headers'] = merged_headers

        try:
            response = self.session.request(method, url, timeout=30, **kwargs)
            response.raise_for_status()
            return response.json() if response.text else {}
        except requests.exceptions.HTTPError as e:
            logger.error(f"[{self.name}] HTTP error for {method} {endpoint}: {e}")
            if e.response is not None:
                logger.error(f"[{self.name}] Response: {e.response.text}")
            raise
        except requests.exceptions.RequestException as e:
            logger.error(f"[{self.name}] Request failed for {method} {endpoint}: {e}")
            raise

    def _get(self, endpoint: str, params: Optional[Dict] = None, **kwargs) -> Any:
        """
        Make GET request.

        Args:
            endpoint: API endpoint
            params: Query parameters to include in the request
            **kwargs: Additional arguments to pass to requests

        Returns:
            Response JSON if successful

        Raises:
            requests.exceptions.RequestException: On any request failure
        """
        if params is not None:
            kwargs['params'] = params
        return self._request('GET', endpoint, **kwargs)

    def _post(self, endpoint: str, data: Optional[Dict] = None, **kwargs) -> Any:
        """
        Make POST request.

        Args:
            endpoint: API endpoint
            data: JSON data to send
            **kwargs: Additional arguments to pass to requests

        Returns:
            Response JSON if successful

        Raises:
            requests.exceptions.RequestException: On any request failure
        """
        if data is not None:
            kwargs['json'] = data
        return self._request('POST', endpoint, **kwargs)

    def _put(self, endpoint: str, data: Optional[Dict] = None, **kwargs) -> Any:
        """
        Make PUT request.

        Args:
            endpoint: API endpoint
            data: JSON data to send
            **kwargs: Additional arguments to pass to requests

        Returns:
            Response JSON if successful

        Raises:
            requests.exceptions.RequestException: On any request failure
        """
        if data is not None:
            kwargs['json'] = data
        return self._request('PUT', endpoint, **kwargs)

    def _delete(self, endpoint: str, **kwargs) -> Any:
        """
        Make DELETE request.

        Args:
            endpoint: API endpoint
            **kwargs: Additional arguments to pass to requests

        Returns:
            Response JSON if successful

        Raises:
            requests.exceptions.RequestException: On any request failure
        """
        return self._request('DELETE', endpoint, **kwargs)
