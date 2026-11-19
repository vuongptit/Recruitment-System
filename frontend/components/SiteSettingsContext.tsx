"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { requestApi } from "../lib/apiClientCore";

export interface SystemSettings {
  siteName: string;
  siteSlogan: string;
  siteLogo: string;
  siteFavicon: string;
  contactEmail: string;
  contactPhone: string;
  footerText: string;
  allowUserRegistration?: boolean;
  maintenanceMode?: boolean;
  updatedAt?: string;
}

export const DEFAULT_SITE_SETTINGS: SystemSettings = {
  siteName: "CareerHub",
  siteSlogan: "Nền tảng tuyển dụng thông minh",
  siteLogo: "",
  siteFavicon: "",
  contactEmail: "admin@gmail.com",
  contactPhone: "",
  footerText: "Cùng bạn tiến xa hơn mỗi ngày.",
  allowUserRegistration: true,
  maintenanceMode: false,
};

interface SiteSettingsContextValue {
  settings: SystemSettings;
  siteName: string;
  siteSlogan: string;
  siteLogo: string;
  siteFavicon: string;
  contactEmail: string;
  contactPhone: string;
  footerText: string;
  refreshSettings: () => Promise<void>;
  updateLocalSettings: (partial: Partial<SystemSettings>) => void;
}

const STORAGE_KEY = "careerhub_site_settings";

const SiteSettingsContext = createContext<SiteSettingsContextValue>({
  settings: DEFAULT_SITE_SETTINGS,
  siteName: DEFAULT_SITE_SETTINGS.siteName,
  siteSlogan: DEFAULT_SITE_SETTINGS.siteSlogan,
  siteLogo: DEFAULT_SITE_SETTINGS.siteLogo,
  siteFavicon: DEFAULT_SITE_SETTINGS.siteFavicon,
  contactEmail: DEFAULT_SITE_SETTINGS.contactEmail,
  contactPhone: DEFAULT_SITE_SETTINGS.contactPhone,
  footerText: DEFAULT_SITE_SETTINGS.footerText,
  refreshSettings: async () => {},
  updateLocalSettings: () => {},
});

export function SiteSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SystemSettings>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          return { ...DEFAULT_SITE_SETTINGS, ...parsed };
        }
      } catch {
        // Ignore JSON error
      }
    }
    return DEFAULT_SITE_SETTINGS;
  });

  const refreshSettings = useCallback(async () => {
    try {
      const res = await requestApi<SystemSettings>("/api/admin/settings/public", {
        maxRetries: 1,
        timeoutMs: 5000,
      });
      if (res.data && res.data.siteName) {
        setSettings(prev => {
          const next = { ...prev, ...res.data };
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
          } catch {
            // Storage quota
          }
          return next;
        });
      }
    } catch {
      // Fallback to existing or default
    }
  }, []);

  useEffect(() => {
    void refreshSettings();
  }, [refreshSettings]);

  // Update dynamic favicon and document title if custom siteName/favicon are provided
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (settings.siteFavicon) {
      let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
      }
      link.href = settings.siteFavicon;
    }
    if (settings.siteName && settings.siteName !== "CareerHub") {
      if (document.title.includes("CareerHub")) {
        document.title = document.title.replace(/CareerHub/g, settings.siteName);
      }
    }
  }, [settings.siteFavicon, settings.siteName]);

  const updateLocalSettings = useCallback((partial: Partial<SystemSettings>) => {
    setSettings(prev => {
      const updated = { ...prev, ...partial };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch {
        // Storage quota
      }
      return updated;
    });
  }, []);

  const value: SiteSettingsContextValue = {
    settings,
    siteName: settings.siteName || DEFAULT_SITE_SETTINGS.siteName,
    siteSlogan: settings.siteSlogan || DEFAULT_SITE_SETTINGS.siteSlogan,
    siteLogo: settings.siteLogo || "",
    siteFavicon: settings.siteFavicon || "",
    contactEmail: settings.contactEmail || DEFAULT_SITE_SETTINGS.contactEmail,
    contactPhone: settings.contactPhone || "",
    footerText: settings.footerText || DEFAULT_SITE_SETTINGS.footerText,
    refreshSettings,
    updateLocalSettings,
  };

  return (
    <SiteSettingsContext.Provider value={value}>
      {children}
    </SiteSettingsContext.Provider>
  );
}

export function useSiteSettings() {
  return useContext(SiteSettingsContext);
}
