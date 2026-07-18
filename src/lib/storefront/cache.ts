import "server-only";import { unstable_cache } from "next/cache";
export const STOREFRONT_CACHE_TAGS={products:"products",categories:"categories",homepage:"homepage",navigation:"navigation",footer:"footer",pages:"pages",settings:"settings",shipping:"shipping",promotions:"promotions"} as const;
export function cacheStorefrontRead<T>(key:readonly string[],tags:readonly string[],loader:()=>Promise<T>):Promise<T>{return unstable_cache(loader,["storefront",...key],{revalidate:300,tags:[...tags]})();}
