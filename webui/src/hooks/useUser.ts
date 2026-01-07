import useSWR from 'swr';
import type { MutatorCallback } from 'swr';

export interface User {
  id: number;
  email?: string;
  plexId?: number;
  plexUsername?: string;
  avatar?: string;
  permissions: number;
  createdAt: string;
  updatedAt: string;
}

export enum Permission {
  NONE = 0,
  ADMIN = 1,
  VIEW = 2,
  MANAGE = 4,
  TRIGGER = 8,
}

interface UserHookResponse {
  user?: User;
  loading: boolean;
  error: Error | undefined;
  revalidate: (
    data?: User | Promise<User> | MutatorCallback<User> | undefined,
    shouldRevalidate?: boolean | undefined
  ) => Promise<User | undefined>;
  hasPermission: (permission: Permission) => boolean;
}

const fetcher = async (url: string) => {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) {
    const error = new Error('Failed to fetch user');
    throw error;
  }
  return res.json();
};

export const useUser = ({
  initialData,
}: { initialData?: User } = {}): UserHookResponse => {
  const {
    data,
    error,
    mutate: revalidate,
  } = useSWR<User>('/api/v1/auth/me', fetcher, {
    fallbackData: initialData,
    refreshInterval: 30000,
    errorRetryInterval: 30000,
    shouldRetryOnError: false,
  });

  const checkPermission = (permission: Permission): boolean => {
    if (!data) return false;
    // Admin has all permissions
    if (data.permissions & Permission.ADMIN) {
      return true;
    }
    return (data.permissions & permission) === permission;
  };

  return {
    user: data,
    loading: !data && !error,
    error,
    hasPermission: checkPermission,
    revalidate,
  };
};

export const hasPermission = (
  permission: Permission,
  userPermissions: number
): boolean => {
  if (userPermissions & Permission.ADMIN) {
    return true;
  }
  return (userPermissions & permission) === permission;
};
