import axios from 'axios';

const PLEX_TV_API = 'https://plex.tv';

export interface PlexUser {
  id: number;
  uuid: string;
  email: string;
  username: string;
  title: string;
  thumb: string;
  authToken: string;
  hasPassword: boolean;
  subscription?: {
    active: boolean;
    status: string;
    plan: string;
  };
  roles?: {
    roles: string[];
  };
}

export class PlexTvAPI {
  private authToken: string;

  constructor(authToken: string) {
    this.authToken = authToken;
  }

  /**
   * Get the user account associated with the auth token
   */
  async getUser(): Promise<PlexUser> {
    const response = await axios.get(`${PLEX_TV_API}/api/v2/user`, {
      headers: {
        Accept: 'application/json',
        'X-Plex-Token': this.authToken,
        'X-Plex-Client-Identifier': 'langarr',
        'X-Plex-Product': 'Langarr',
      },
    });

    return {
      ...response.data,
      authToken: this.authToken,
    };
  }

  /**
   * Check if a user has access to the Plex server
   * This would require the admin's server claim token
   */
  async checkUserAccess(userId: number): Promise<boolean> {
    try {
      // Get friends/users that have access to the server
      const response = await axios.get(`${PLEX_TV_API}/api/v2/friends`, {
        headers: {
          Accept: 'application/json',
          'X-Plex-Token': this.authToken,
          'X-Plex-Client-Identifier': 'langarr',
          'X-Plex-Product': 'Langarr',
        },
      });

      // Check if user is in the friends list
      const friends = response.data as Array<{ id: number }>;
      return friends.some((friend) => friend.id === userId);
    } catch {
      return false;
    }
  }

  /**
   * Test if the auth token is valid
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.getUser();
      return true;
    } catch {
      return false;
    }
  }
}
