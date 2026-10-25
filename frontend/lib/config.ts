/**
 * Application Configuration
 * 
 * Centralized configuration management for environment variables
 * and application settings.
 */

import type { EnvironmentConfig } from "@/types"

/**
 * Application Configuration Object
 */
export const config: EnvironmentConfig = {
  // API base is same-origin (empty string) on purpose: every request goes to
  // this Next app at /api/* and next.config rewrites proxy it to the backend.
  // Keeping traffic first-party is what makes the HttpOnly refresh-token cookie
  // work with SameSite=Lax. The upstream backend URL is configured server-side
  // via BACKEND_API_URL / NEXT_PUBLIC_API_URL in next.config, NOT here.
  apiUrl: "",
  
  // Application Metadata
  appName: process.env.NEXT_PUBLIC_APP_NAME || "LibraFlow",
  appVersion: process.env.NEXT_PUBLIC_APP_VERSION || "1.0.0",
  
  // Environment Flags
  isDevelopment: process.env.NODE_ENV === "development",
  isProduction: process.env.NODE_ENV === "production",
}

/**
 * API Endpoints
 */
export const API_ENDPOINTS = {
  auth: {
    login: "/api/v1/auth/login",
    register: "/api/v1/auth/register",
    logout: "/api/v1/auth/logout",
    refresh: "/api/v1/auth/refresh",
  },
  
  books: {
    base: "/api/v1/books",
    byId: (id: number) => `/api/v1/books/${id}`,
    search: "/api/v1/books/search",
    categories: "/api/v1/books/categories",
  },
  
  transactions: {
    base: "/api/v1/transactions",
    byId: (id: number) => `/api/v1/transactions/${id}`,
    issue: "/api/v1/issue",
    return: "/api/v1/return",
    overdue: "/api/v1/transactions/overdue",
  },
  
  users: {
    base: "/api/v1/users",
    byId: (id: number) => `/api/v1/users/${id}`,
    profile: "/api/v1/users/profile",
  },

  admin: {
    users: "/api/v1/admin/users",
    userById: (id: number) => `/api/v1/admin/users/${id}`,
    updateRole: (id: number) => `/api/v1/admin/users/${id}/role`,
  },
} as const

/**
 * Application Constants
 */
export const APP_CONSTANTS = {
  // Pagination
  DEFAULT_PAGE_SIZE: 10,
  MAX_PAGE_SIZE: 100,
  
  // Timeouts
  API_TIMEOUT: 30000, // 30 seconds
  DEBOUNCE_DELAY: 300, // 300ms
  
  // Storage Keys
  STORAGE_KEYS: {
    TOKEN: "token",
    USER: "user",
    THEME: "theme",
  },
  
  // Date Formats
  DATE_FORMAT: "MMM dd, yyyy",
  DATETIME_FORMAT: "MMM dd, yyyy HH:mm",
  
  // Validation
  MIN_PASSWORD_LENGTH: 8,
  MAX_USERNAME_LENGTH: 50,
  MAX_TITLE_LENGTH: 200,
  
  // File Upload
  MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
  ALLOWED_IMAGE_TYPES: ["image/jpeg", "image/png", "image/webp"],
} as const

/**
 * Feature Flags
 * Toggle features on/off without code changes
 */
export const FEATURE_FLAGS = {
  ENABLE_ANALYTICS: config.isProduction,
  ENABLE_ERROR_REPORTING: config.isProduction,
  ENABLE_DEBUG_LOGS: config.isDevelopment,
  ENABLE_OFFLINE_MODE: false,
  ENABLE_DARK_MODE: true,
  ENABLE_NOTIFICATIONS: true,
} as const

/**
 * Route Paths
 */
export const ROUTES = {
  HOME: "/",
  LOGIN: "/login",
  REGISTER: "/register",
  UNAUTHORIZED: "/unauthorized",
  
  FORGOT_PASSWORD: "/forgot-password",
  RESET_PASSWORD: "/reset-password",
  VERIFY_EMAIL: "/verify-email",
  
  DASHBOARD: {
    HOME: "/dashboard",
    BOOKS: "/dashboard/books",
    MEMBERS: "/dashboard/members",
    ISSUE: "/dashboard/issue",
    RETURN: "/dashboard/return",
    TRANSACTIONS: "/dashboard/transactions",
  },
} as const

/**
 * Role-based Route Access
 */
export const ROUTE_PERMISSIONS = {
  [ROUTES.DASHBOARD.HOME]: ["ADMIN", "LIBRARIAN", "USER"],
  [ROUTES.DASHBOARD.BOOKS]: ["ADMIN", "LIBRARIAN", "USER"],
  [ROUTES.DASHBOARD.MEMBERS]: ["ADMIN", "LIBRARIAN"],
  [ROUTES.DASHBOARD.ISSUE]: ["ADMIN", "LIBRARIAN"],
  [ROUTES.DASHBOARD.RETURN]: ["ADMIN", "LIBRARIAN"],
  [ROUTES.DASHBOARD.TRANSACTIONS]: ["ADMIN", "LIBRARIAN"],
} as const

/**
 * Validate configuration on startup
 */
export function validateConfig(): void {
  const requiredVars = [
    { key: "NEXT_PUBLIC_API_URL", value: config.apiUrl },
  ]
  
  const missing = requiredVars.filter(({ value }) => !value)
  
  if (missing.length > 0 && config.isDevelopment) {
    console.warn(
      "Missing required environment variables:",
      missing.map(({ key }) => key).join(", ")
    )
  }
}

// Validate on module load
if (typeof window !== "undefined") {
  validateConfig()
}

/**
 * Get full API URL
 */
export function getApiUrl(endpoint: string): string {
  return `${config.apiUrl}${endpoint}`
}

/**
 * Check if feature is enabled
 */
export function isFeatureEnabled(feature: keyof typeof FEATURE_FLAGS): boolean {
  return FEATURE_FLAGS[feature]
}

/**
 * Get storage key
 */
export function getStorageKey(key: keyof typeof APP_CONSTANTS.STORAGE_KEYS): string {
  return APP_CONSTANTS.STORAGE_KEYS[key]
}
