import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { TabName } from './types';

interface TabsApi {
  active: TabName;
  goToTab: (name: TabName) => void;
}

const TabsContext = createContext<TabsApi | undefined>(undefined);

export interface TabScreenProps {
  /** True while this tab is the visible one - use it to refresh on entry. */
  active: boolean;
}

/**
 * Owns which tab is showing.
 *
 * It sits ABOVE the stack navigator, not inside the tab host, because pushed
 * screens like Checkout and Order placed also need to send the user to a tab
 * ("Continue shopping" -> Home). Keeping it inside MainTabs would make
 * useTabs() throw on every screen pushed on top of it.
 */
export function TabsProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState<TabName>('home');
  const goToTab = useCallback((name: TabName) => setActive(name), []);
  const value = useMemo(() => ({ active, goToTab }), [active, goToTab]);
  return <TabsContext.Provider value={value}>{children}</TabsContext.Provider>;
}

export function useTabs(): TabsApi {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error('useTabs must be used inside <TabsProvider>');
  return ctx;
}
