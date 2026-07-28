"use client";

import { createContext, useContext } from "react";

const DashboardSidebarContext = createContext({ collapsed: false });

export function DashboardSidebarProvider({
  collapsed,
  children,
}: {
  collapsed: boolean;
  children: React.ReactNode;
}) {
  return (
    <DashboardSidebarContext.Provider value={{ collapsed }}>
      {children}
    </DashboardSidebarContext.Provider>
  );
}

export function useDashboardSidebar() {
  return useContext(DashboardSidebarContext);
}
