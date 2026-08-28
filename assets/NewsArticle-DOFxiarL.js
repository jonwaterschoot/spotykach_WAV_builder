import{r as t}from"./utils-io-f-0ju2_f.js";import{j as o,M as l,e as h,h as d}from"./vendor-Iqen1fAt.js";const x=async()=>{const e=await fetch(`${t("/news/news-manifest.json")}?t=${Date.now()}`);if(!e.ok)throw new Error("Failed to fetch news manifest");const r=await e.json(),a={};return await Promise.all(r.map(async n=>{try{const s=await fetch(t(`/news/${n.file}`));s.ok&&(a[n.id]=await s.text())}catch(s){console.error(`Failed to fetch content for ${n.id}`,s)}})),{items:r,content:a}},w=e=>e.find(r=>r.pinned)||e[0],i=e=>e?e.startsWith("http")||e.startsWith("/")?t(e):t(`/news/${e}`):"",p=e=>{const r={...e};return delete r.node,r},f=({markdown:e})=>o.jsx("div",{className:`prose prose-invert max-w-none\r
      [&>*:first-child]:mt-0\r
      prose-h1:text-3xl prose-h1:font-bold prose-h1:text-synthux-yellow prose-h1:mt-8 prose-h1:mb-4 prose-h1:font-header prose-h1:uppercase prose-h1:tracking-tight\r
      prose-h2:text-xl prose-h2:font-bold prose-h2:text-synthux-orange prose-h2:mt-6 prose-h2:mb-3 prose-h2:font-header prose-h2:uppercase prose-h2:tracking-tight\r
      prose-p:text-gray-300 prose-p:leading-relaxed prose-p:text-lg prose-p:my-5\r
      prose-ul:list-disc prose-ul:pl-6 prose-ul:my-5\r
      prose-li:text-gray-300 prose-li:my-2\r
      prose-strong:text-white prose-strong:font-bold\r
      prose-em:italic prose-em:opacity-80\r
      prose-a:text-synthux-yellow prose-a:no-underline hover:prose-a:underline prose-a:font-bold\r
      prose-img:rounded-3xl prose-img:border prose-img:border-white/10 prose-img:shadow-2xl prose-img:my-10\r
      prose-video:rounded-3xl prose-video:border prose-video:border-white/10 prose-video:shadow-2xl prose-video:my-10 prose-video:w-full\r
    `,children:o.jsx(l,{remarkPlugins:[d],rehypePlugins:[h],components:{video:r=>o.jsx("video",{...p(r),src:i(r.src)}),img:r=>o.jsx("img",{...p(r),src:i(r.src)}),a:r=>o.jsx("a",{...p(r),target:"_blank",rel:"noreferrer"})},children:e})});export{f as N,w as a,x as f};
