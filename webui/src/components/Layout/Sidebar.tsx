import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  HomeIcon,
  Cog6ToothIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  children?: { name: string; href: string }[];
}

const navigation: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: HomeIcon },
  {
    name: 'Settings',
    href: '/settings',
    icon: Cog6ToothIcon,
    children: [
      { name: 'General', href: '/settings/general' },
      { name: 'Radarr', href: '/settings/radarr' },
      { name: 'Sonarr', href: '/settings/sonarr' },
      { name: 'Overseerr', href: '/settings/overseerr' },
    ],
  },
  { name: 'Logs', href: '/logs', icon: DocumentTextIcon },
];

export default function Sidebar() {
  const router = useRouter();

  const isActive = (href: string) => {
    if (href === '/settings') {
      return router.pathname.startsWith('/settings');
    }
    return router.pathname === href || router.pathname.startsWith(href + '/');
  };

  return (
    <div className="flex h-full w-64 flex-col bg-gray-900">
      {/* Logo */}
      <div className="flex h-16 items-center px-6">
        <span className="text-xl font-bold text-white">LANGARR</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navigation.map((item) => (
          <div key={item.name}>
            <Link
              href={item.children ? item.children[0].href : item.href}
              className={`group flex items-center rounded-md px-3 py-2 text-sm font-medium ${
                isActive(item.href)
                  ? 'bg-gray-800 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <item.icon
                className={`mr-3 h-5 w-5 flex-shrink-0 ${
                  isActive(item.href)
                    ? 'text-white'
                    : 'text-gray-400 group-hover:text-white'
                }`}
              />
              {item.name}
            </Link>
            {item.children && isActive(item.href) && (
              <div className="ml-8 mt-1 space-y-1">
                {item.children.map((child) => (
                  <Link
                    key={child.name}
                    href={child.href}
                    className={`block rounded-md px-3 py-2 text-sm ${
                      router.pathname === child.href
                        ? 'text-white font-medium'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {child.name}
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>
    </div>
  );
}
