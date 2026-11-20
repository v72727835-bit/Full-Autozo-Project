"use client";

import React from 'react';
import { usePathname } from 'next/navigation';
import Layout from './components/Layout';
import { CenterSpinner, EmptyState } from './components/ui';
import { useAuth } from './context/AuthContext';
import { StatsProvider } from './context/StatsContext';
import { Navigate } from './navigation';
import { Permission, can, isSuperAdmin } from './lib/permissions';
import dynamic from 'next/dynamic';
import PublicPayPage from './screens/PublicPayPage';

const AnalyticsPage = dynamic(() => import('./screens/AnalyticsPage'), { ssr: false });
const BannersPage = dynamic(() => import('./screens/BannersPage'), { ssr: false });
const MediaPage = dynamic(() => import('./screens/MediaPage'), { ssr: false });
const NoticesPage = dynamic(() => import('./screens/NoticesPage'), { ssr: false });
const RidersPage = dynamic(() => import('./screens/RidersPage'), { ssr: false });
const PayoutsPage = dynamic(() => import('./screens/PayoutsPage'), { ssr: false });
const RiderProfilePage = dynamic(() => import('./screens/RiderProfilePage'), { ssr: false });
const SettingsStorePage = dynamic(() => import('./screens/SettingsStorePage'), { ssr: false });
const ThemePage = dynamic(() => import('./screens/ThemePage'), { ssr: false });
const SupportPage = dynamic(() => import('./screens/SupportPage'), { ssr: false });
const CategoriesPage = dynamic(() => import('./screens/CategoriesPage'), { ssr: false });
const DashboardPage = dynamic(() => import('./screens/DashboardPage'), { ssr: false });
const InventoryPage = dynamic(() => import('./screens/InventoryPage'), { ssr: false });
const LoginPage = dynamic(() => import('./screens/LoginPage'), { ssr: false });
const OffersPage = dynamic(() => import('./screens/OffersPage'), { ssr: false });
const OrdersPage = dynamic(() => import('./screens/OrdersPage'), { ssr: false });
const ProductsPage = dynamic(() => import('./screens/ProductsPage'), { ssr: false });
const SettingsPage = dynamic(() => import('./screens/SettingsPage'), { ssr: false });
const ShopsPage = dynamic(() => import('./screens/ShopsPage'), { ssr: false });
const DeliveryPricingPage = dynamic(() => import('./screens/DeliveryPricingPage'), { ssr: false });
const WarehouseRequestsPage = dynamic(() => import('./screens/WarehouseRequestsPage'), { ssr: false });
const EnquiriesPage = dynamic(() => import('./screens/EnquiriesPage'), { ssr: false });
const StandardCategoriesPage = dynamic(() => import('./screens/StandardCategoriesPage'), { ssr: false });
const IntegrationsPage = dynamic(() => import('./screens/IntegrationsPage'), { ssr: false });
const SellerApp = dynamic(() => import('./seller/SellerApp'), { ssr: false });
const ProviderApp = dynamic(() => import('./provider/ProviderApp'), { ssr: false });
const ProviderRequestsPage = dynamic(() => import('./screens/ProviderRequestsPage'), { ssr: false });
const ServiceCategoriesPage = dynamic(() => import('./screens/ServiceCategoriesPage'), { ssr: false });
const ServiceBookingsPage = dynamic(() => import('./screens/ServiceBookingsPage'), { ssr: false });
const SubscriptionsPage = dynamic(() => import('./screens/SubscriptionsPage'), { ssr: false });
const UsersPage = dynamic(() => import('./screens/UsersPage'), { ssr: false });
const AdsPage = dynamic(() => import('./screens/AdsPage'), { ssr: false });
const PagesPage = dynamic(() => import('./screens/PagesPage'), { ssr: false });
const TeamPage = dynamic(() => import('./screens/TeamPage'), { ssr: false });

/**
 * Which permission a panel route needs, so a sub-admin only reaches their
 * sections. `'super'` means super-admins only; `null` means every admin
 * (dashboard, analytics and their own account). The backend enforces the
 * same rules on the API.
 */
function routePermission(pathname: string): Permission | 'super' | null {
  if (pathname.startsWith('/riders/')) return 'riders';
  const map: Record<string, Permission | 'super'> = {
    '/products': 'products',
    '/inventory': 'products',
    '/categories': 'categories',
    '/standard-categories': 'settings',
    '/banners': 'banners',
    '/gallery': 'media',
    '/videos': 'media',
    '/notifications': 'media',
    '/offers': 'offers',
    '/ads': 'ads',
    '/pages': 'pages',
    '/orders': 'orders',
    '/shops': 'shops',
    '/warehouse-requests': 'shops',
    '/provider-requests': 'shops',
    '/service-categories': 'categories',
    '/service-bookings': 'orders',
    '/riders': 'riders',
    '/payouts': 'payouts',
    '/subscriptions': 'subscriptions',
    '/rider-accounts': 'users',
    '/customers': 'users',
    '/support': 'support',
    '/enquiries': 'enquiries',
    '/delivery-pricing': 'settings',
    '/store-settings': 'settings',
    '/theme': 'settings',
    '/integrations': 'integrations',
    '/team': 'super',
  };
  return map[pathname] ?? null;
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <CenterSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  // A warehouse never sees the admin panel: it gets its own panel.
  if (user.role === 'seller') return <SellerApp />;
  // A service provider gets its own panel too.
  if (user.role === 'provider') return <ProviderApp />;
  return <StatsProvider>{children}</StatsProvider>;
}

function NoAccess() {
  return (
    <div className="card" style={{ marginTop: 24 }}>
      <EmptyState title="No access to this section" hint="Ask a super admin to grant you access from Team & Access." />
    </div>
  );
}

function CurrentPage({ pathname, user }: { pathname: string; user: ReturnType<typeof useAuth>['user'] }) {
  const needed = routePermission(pathname);
  if (needed === 'super' ? !isSuperAdmin(user) : needed && !can(user, needed)) return <NoAccess />;
  if (pathname.startsWith('/riders/')) return <RiderProfilePage riderId={pathname.slice('/riders/'.length)} />;
  switch (pathname) {
    case '/':
      return <DashboardPage />;
    case '/analytics':
      return <AnalyticsPage />;
    case '/products':
      return <ProductsPage />;
    case '/inventory':
      return <InventoryPage />;
    case '/integrations':
      return <IntegrationsPage />;
    case '/standard-categories':
      return <StandardCategoriesPage />;
    case '/categories':
      return <CategoriesPage />;
    case '/banners':
      return <BannersPage />;
    case '/gallery':
      return <MediaPage kind="photo" />;
    case '/videos':
      return <MediaPage kind="video" />;
    case '/offers':
      return <OffersPage />;
    case '/orders':
      return <OrdersPage />;
    case '/shops':
      return <ShopsPage />;
    case '/riders':
      return <RidersPage />;
    case '/payouts':
      return <PayoutsPage />;
    case '/subscriptions':
      return <SubscriptionsPage />;
    case '/rider-accounts':
      return <UsersPage fixedRole="rider" title="Riders" subtitle="Delivery partners authorised to collect and deliver Autozo orders." />;
    case '/customers':
      return <UsersPage fixedRole="customer" title="Customers" subtitle="All customers registered on the Autozo app and website." />;
    case '/team':
      return <TeamPage />;
    case '/ads':
      return <AdsPage />;
    case '/pages':
      return <PagesPage />;
    case '/support':
      return <SupportPage />;
    case '/notifications':
      return <NoticesPage />;
    case '/delivery-pricing':
      return <DeliveryPricingPage />;
    case '/warehouse-requests':
      return <WarehouseRequestsPage />;
    case '/provider-requests':
      return <ProviderRequestsPage />;
    case '/service-categories':
      return <ServiceCategoriesPage />;
    case '/service-bookings':
      return <ServiceBookingsPage />;
    case '/enquiries':
      return <EnquiriesPage />;
    case '/store-settings':
      return <SettingsStorePage />;
    case '/theme':
      return <ThemePage />;
    case '/settings':
      return <SettingsPage />;
    default:
      return <Navigate to="/" replace />;
  }
}

export default function AdminApp() {
  const pathname = usePathname() ?? '/';
  // Provider app plan payments land here on panel.autozo.org. Keep checkout
  // public so it can verify the signed payment with the token in the URL hash.
  if (pathname === '/pay') return <PublicPayPage />;
  if (pathname === '/login') return <LoginPage />;

  return (
    <RequireAuth>
      <AdminShell pathname={pathname} />
    </RequireAuth>
  );
}

function AdminShell({ pathname }: { pathname: string }) {
  const { user } = useAuth();
  return (
    <Layout>
      <CurrentPage pathname={pathname} user={user} />
    </Layout>
  );
}
