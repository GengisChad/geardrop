import Image from "next/image";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { categoryArt, productImages } from "@/data/assets";
import { CATEGORIES } from "@/data/catalog";
import type { CategorySlug } from "@/lib/commerce/types";

/**
 * Tile art: Beyblade and Stadi reuse the product cut-outs (higher resolution than the
 * mockup's own tile art); Lanciatori and Accessori use the tiles. (audit §9)
 */
const TILE_ART: Record<CategorySlug, { src: string; width: number; height: number }> = {
  "beyblade-x": productImages["wizard-arrow-4-80b"][0],
  lanciatori: categoryArt.lanciatori,
  stadi: productImages["stadio-beystadium-x-attack-set"][0],
  accessori: categoryArt.accessori,
};

export function CategoryTiles() {
  return (
    <section className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6">
      <h2 className="sr-only">Categorie</h2>
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        {CATEGORIES.map((category) => {
          const art = TILE_ART[category.slug];
          return (
            <li key={category.slug}>
              <Link
                href={`/negozio/${category.slug}`}
                className="group relative flex h-40 overflow-hidden rounded-[--radius-card] border border-grey-200 bg-white transition-[border-color,box-shadow] duration-300 hover:border-violet hover:shadow-[0_18px_40px_-20px_rgba(122,60,255,0.5)] sm:h-44"
              >
                <div className="relative z-10 flex flex-col p-4">
                  <h3 className="text-small font-bold text-graphite sm:text-body">{category.name}</h3>
                  <p className="mt-1 max-w-[9rem] text-[0.6875rem] leading-tight text-grey-600 sm:text-small">
                    {category.tagline}
                  </p>
                  <span className="mt-auto inline-flex size-7 items-center justify-center rounded-full border border-grey-200 bg-white text-violet transition-transform duration-300 group-hover:translate-x-1">
                    <ChevronRight className="size-4" strokeWidth={2.5} aria-hidden="true" />
                  </span>
                </div>

                <Image
                  src={art.src}
                  alt=""
                  aria-hidden="true"
                  width={art.width}
                  height={art.height}
                  sizes="180px"
                  className="absolute -bottom-1 right-0 h-[76%] w-auto max-w-[58%] object-contain transition-transform duration-500 ease-[--ease-out-gear] group-hover:scale-105"
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
