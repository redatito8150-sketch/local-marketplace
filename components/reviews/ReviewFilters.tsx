import Link from "next/link";

export default function ReviewFilters({ products, values, basePath }: { products: {id:string;name:string}[]; values: Record<string,string|undefined>; basePath:string }) {
  return <form action={basePath} className="flex flex-wrap items-center gap-2 rounded-2xl border border-[#e7ddd4] bg-white p-3">
    <select name="rating" defaultValue={values.rating??""} aria-label="Filter by rating" className="min-h-10 rounded-full border border-[#ddd2c8] bg-white px-3 text-xs"><option value="">All ratings</option>{[5,4,3,2,1].map(r=><option key={r} value={r}>{r} stars</option>)}</select>
    <select name="product" defaultValue={values.product??""} aria-label="Filter by product" className="min-h-10 max-w-48 rounded-full border border-[#ddd2c8] bg-white px-3 text-xs"><option value="">All products</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
    <select name="sort" defaultValue={values.sort??"recent"} aria-label="Sort reviews" className="min-h-10 rounded-full border border-[#ddd2c8] bg-white px-3 text-xs"><option value="recent">Most recent</option><option value="helpful">Most helpful</option><option value="highest">Highest rated</option><option value="lowest">Lowest rated</option><option value="photos">Photos first</option></select>
    <input name="q" defaultValue={values.q} placeholder="Search reviews" className="min-h-10 min-w-44 flex-1 rounded-full border border-[#ddd2c8] px-4 text-xs"/>
    <label className="flex min-h-10 items-center gap-2 rounded-full border border-[#ddd2c8] px-3 text-xs"><input type="checkbox" name="photos" value="1" defaultChecked={values.photos==="1"}/>With photos</label>
    <label className="flex min-h-10 items-center gap-2 rounded-full border border-[#ddd2c8] px-3 text-xs"><input type="checkbox" name="replied" value="1" defaultChecked={values.replied==="1"}/>Brand replied</label>
    <button className="min-h-10 rounded-full bg-[#781c2d] px-5 text-xs font-bold text-white">Apply</button>
    <Link href={basePath} className="px-3 text-xs font-semibold text-[#8f2335]">Reset</Link>
  </form>;
}
