/**
 * Mosaic Router (tiny History API router)
 *
 * Designed for clean URLs + GitHub Pages SPA fallback.
 * Mobile-first: routes are simple, views handle their own mobile behavior.
 */

export type Route = 
  | { name: 'gallery' }
  | { name: 'map'; slug: string }
  | { name: 'hunt'; id: string }
  | { name: 'studio' };

type RouteHandler = (route: Route) => void;

let currentRoute: Route = { name: 'gallery' };
let handler: RouteHandler | null = null;

function parseRoute(): Route {
  const path = window.location.pathname.replace(import.meta.env.BASE_URL, '/').replace(/\/$/, '') || '/';

  if (path === '/' || path === '') {
    return { name: 'gallery' };
  }

  const mapMatch = path.match(/^\/map\/([^/]+)$/);
  if (mapMatch) {
    return { name: 'map', slug: decodeURIComponent(mapMatch[1]) };
  }

  const huntMatch = path.match(/^\/hunts\/([^/]+)$/);
  if (huntMatch) {
    return { name: 'hunt', id: decodeURIComponent(huntMatch[1]) };
  }

  if (path === '/studio') {
    return { name: 'studio' };
  }

  // Fallback
  return { name: 'gallery' };
}

function updateRoute(route: Route, push = true) {
  currentRoute = route;

  let url = '/';
  if (route.name === 'map') {
    url = `/map/${encodeURIComponent(route.slug)}`;
  } else if (route.name === 'hunt') {
    url = `/hunts/${encodeURIComponent(route.id)}`;
  } else if (route.name === 'studio') {
    url = '/studio';
  }

  const fullUrl = (import.meta.env.BASE_URL || '/') + url.replace(/^\//, '');

  if (push) {
    history.pushState({}, '', fullUrl);
  } else {
    history.replaceState({}, '', fullUrl);
  }

  if (handler) handler(currentRoute);
}

export function initRouter(onRouteChange: RouteHandler) {
  handler = onRouteChange;
  currentRoute = parseRoute();

  window.addEventListener('popstate', () => {
    currentRoute = parseRoute();
    if (handler) handler(currentRoute);
  });

  // Initial route
  if (handler) handler(currentRoute);
}

export function navigateTo(route: Route) {
  updateRoute(route, true);
}

export function replaceRoute(route: Route) {
  updateRoute(route, false);
}

export function getCurrentRoute(): Route {
  return { ...currentRoute };
}

// Convenience helpers
export const goToGallery = () => navigateTo({ name: 'gallery' });
export const goToMap = (slug: string) => navigateTo({ name: 'map', slug });
export const goToHunt = (id: string) => navigateTo({ name: 'hunt', id });
export const goToStudio = () => navigateTo({ name: 'studio' });
