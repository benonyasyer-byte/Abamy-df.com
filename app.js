(() => {
  const cfg = window.ABAMY_CONFIG || {};
  const ready = cfg.SUPABASE_URL && !cfg.SUPABASE_URL.includes("PROJECT_ID") &&
    cfg.SUPABASE_PUBLISHABLE_KEY && !cfg.SUPABASE_PUBLISHABLE_KEY.startsWith("ISI_DENGAN");
  const $ = (id) => document.getElementById(id);
  const money = (v) => new Intl.NumberFormat("id-ID", {style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Number(v||0));
  let supabase = null, session = null, currentTab = "login", currentProfile = null, editingImageUrl = null;

  function msg(id, text, kind="") { const el=$(id); el.textContent=text; el.className="message"+(kind?" "+kind:""); }
  function escapeHtml(s="") { return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
  function slugify(s="") { return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,50); }
  function waLink(product) {
    const phone = String(cfg.WHATSAPP_ADMIN||"").replace(/\D/g,"");
    const text = `Halo, saya tertarik dengan produk ${product.name} seharga ${money(product.price)} di toko ${product.store_name||"Abamy DF"}.`;
    return phone ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}` : "#";
  }
  function productCard(p) {
    const img = p.image_url || "";
    return `<article class="product-card">${img?`<img loading="lazy" src="${escapeHtml(img)}" alt="${escapeHtml(p.name)}">`:`<div class="empty-state">Tidak ada foto</div>`}
      <div class="product-body"><h3>${escapeHtml(p.name)}</h3><p>${escapeHtml(p.description||"Produk pilihan dari toko kami.")}</p>
      <div class="price">${money(p.price)}</div><div class="product-meta">Stok: ${Number(p.stock||0)} · ${escapeHtml(p.store_name||"Abamy DF")}</div>
      <a class="button" href="${waLink(p)}" target="_blank" rel="noopener">Pesan via WhatsApp</a></div></article>`;
  }
  async function loadPublicProducts() {
    const el=$("publicProducts");
    if (!ready || !supabase) { el.innerHTML='<div class="empty-state">Hubungkan Supabase terlebih dahulu untuk mengaktifkan katalog publik.</div>'; return; }
    const {data,error}=await supabase.from("products").select("id,store_id,name,description,price,stock,image_url,created_at,stores(name,slug)").eq("is_published",true).order("created_at",{ascending:false}).limit(60);
    if(error){el.innerHTML='<div class="empty-state">Katalog belum dapat dimuat. Periksa konfigurasi dan SQL Supabase.</div>';return;}
    el.innerHTML=data.length?data.map(p=>productCard({...p,store_name:p.stores?.name||"Toko"})).join(""):'<div class="empty-state">Belum ada produk yang dipublikasikan.</div>';
  }
  async function loadStore(slug) {
    if(!ready||!supabase)return;
    const {data:store,error}=await supabase.from("stores").select("id,name,slug,description").eq("slug",slug).maybeSingle();
    if(error||!store)return;
    $("shopView").classList.remove("hidden");$("shopTitle").textContent=store.name;$("shopDescription").textContent=store.description||"Produk dari "+store.name;
    const {data}=await supabase.from("products").select("id,name,description,price,stock,image_url,created_at").eq("store_id",store.id).eq("is_published",true).order("created_at",{ascending:false});
    $("shopProducts").innerHTML=(data||[]).length?data.map(p=>productCard({...p,store_name:store.name})).join(""):'<div class="empty-state">Toko ini belum memiliki produk publik.</div>';
  }
  function showTab(tab) {
    currentTab=tab;
    document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===tab));
    $("nameWrap").classList.toggle("hidden",tab!=="signup");
    $("slugWrap").classList.toggle("hidden",tab!=="signup");
    $("passwordWrap").classList.toggle("hidden",tab==="reset");
    $("password").required=tab!=="reset";
    $("authSubmit").textContent=tab==="login"?"Login":tab==="signup"?"Buat akun":"Kirim tautan pemulihan";
    msg("authMessage","");
  }
  function resetProductForm() {
    $("productForm").reset();$("productId").value="";$("productStock").value="0";$("productPublished").checked=true;
    $("productFormTitle").textContent="Tambah produk";editingImageUrl=null;msg("productMessage","");
  }
  async function loadMyProducts() {
    if(!session||!currentProfile)return;
    const {data,error}=await supabase.from("products").select("*").eq("store_id",currentProfile.id).order("created_at",{ascending:false});
    if(error){$("myProducts").innerHTML='<div class="empty-state">Gagal mengambil produk. Periksa kebijakan RLS.</div>';return;}
    $("productCount").textContent=`${data.length} produk`;
    $("myProducts").innerHTML=data.length?data.map(p=>`<div class="my-product"><img src="${escapeHtml(p.image_url||"")}" alt=""><div><h4>${escapeHtml(p.name)}</h4><p>${money(p.price)} · Stok ${Number(p.stock)} · ${p.is_published?"Publik":"Draft"}</p><div class="actions"><button class="small-button" data-edit="${p.id}">Edit</button><button class="small-button danger" data-delete="${p.id}">Hapus</button></div></div></div>`).join(""):'<div class="empty-state">Belum ada produk. Tambahkan produk pertama dari formulir.</div>';
    $("myProducts").querySelectorAll("[data-edit]").forEach(b=>b.addEventListener("click",()=>editProduct(data.find(p=>p.id===b.dataset.edit))));
    $("myProducts").querySelectorAll("[data-delete]").forEach(b=>b.addEventListener("click",()=>deleteProduct(data.find(p=>p.id===b.dataset.delete))));
  }
  async function editProduct(p) {
    if(!p)return;
    $("productId").value=p.id;$("productName").value=p.name;$("productDescription").value=p.description||"";
    $("productPrice").value=p.price;$("productStock").value=p.stock;$("productPublished").checked=p.is_published;
    $("productFormTitle").textContent="Edit produk";editingImageUrl=p.image_url||null;msg("productMessage","Jika foto tidak dipilih, foto lama akan tetap digunakan.");
    $("productForm").scrollIntoView({behavior:"smooth",block:"start"});
  }
  async function deleteProduct(p) {
    if(!p||!confirm(`Hapus produk "${p.name}"?`))return;
    const {error}=await supabase.from("products").delete().eq("id",p.id);
    if(error){msg("productMessage","Gagal menghapus produk: "+error.message,"error");return;}
    if(p.image_path) await supabase.storage.from("product-images").remove([p.image_path]);
    await loadMyProducts();await loadPublicProducts();
  }
  async function updateAuthUI() {
    const {data:{session:s}}=await supabase.auth.getSession();session=s;
    $("authPanel").classList.toggle("hidden",!!session);$("dashboard").classList.toggle("hidden",!session);
    if(!session){currentProfile=null;$("myProducts").innerHTML='<div class="empty-state">Login untuk melihat produk.</div>';return;}
    const {data:profile,error}=await supabase.from("stores").select("*").eq("owner_id",session.user.id).maybeSingle();
    if(error){msg("authMessage","Profil toko belum tersedia. Pastikan SQL schema sudah dijalankan.","error");return;}
    if(!profile){msg("authMessage","Akun terdaftar, tetapi profil toko belum dibuat. Periksa trigger pada SQL setup.","error");$("dashboard").classList.add("hidden");$("authPanel").classList.remove("hidden");return;}
    currentProfile=profile;$("welcome").textContent=`Halo, ${profile.name}`;$("dashboardInfo").textContent=session.user.email||"Akun klien";
    const url=new URL(location.href);url.search="";url.searchParams.set("shop",profile.slug);
    $("publicShopLink").href=url.toString();$("publicShopLink").textContent="Buka toko publik ↗";
    await loadMyProducts();
  }
  async function handleAuth(e) {
    e.preventDefault();if(!ready){msg("authMessage","Konfigurasi Supabase belum diisi di config.js.","error");return;}
    const email=$("email").value.trim(),password=$("password").value;
    msg("authMessage","Memproses…");
    try{
      if(currentTab==="signup"){
        const name=$("storeName").value.trim(),slug=slugify($("storeSlug").value||name);
        if(!name||!slug){msg("authMessage","Isi nama toko dan slug toko.","error");return;}
        const {data,error}=await supabase.auth.signUp({email,password,options:{data:{store_name:name,store_slug:slug}}});
        if(error)throw error;
        if(data.session){await updateAuthUI();msg("authMessage","Akun dibuat. Periksa email jika konfirmasi email diaktifkan.","success");}
        else msg("authMessage","Pendaftaran diterima. Periksa email untuk konfirmasi, lalu login. Profil toko dibuat setelah konfirmasi melalui trigger database.","success");
      } else if(currentTab==="login") {
        const {error}=await supabase.auth.signInWithPassword({email,password});if(error)throw error;
        await updateAuthUI();msg("authMessage","Login berhasil.","success");
      } else {
        const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});if(error)throw error;
        msg("authMessage","Jika email terdaftar, tautan pemulihan akan dikirim.","success");
      }
    }catch(err){msg("authMessage",err.message||"Permintaan gagal.","error");}
  }
  async function saveProduct(e) {
    e.preventDefault();if(!session||!currentProfile)return;
    const name=$("productName").value.trim(),price=Number($("productPrice").value),stock=Number($("productStock").value);
    if(!name||!Number.isFinite(price)||price<0||!Number.isInteger(stock)||stock<0){msg("productMessage","Periksa nama, harga, dan stok.","error");return;}
    let imageUrl=editingImageUrl||null,imagePath=null;
    const file=$("productImage").files[0];
    if(file){
      if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>5*1024*1024){msg("productMessage","Foto harus JPG, PNG, atau WebP dan maksimal 5 MB.","error");return;}
      const ext=file.type==="image/png"?"png":file.type==="image/webp"?"webp":"jpg";
      imagePath=`${session.user.id}/${crypto.randomUUID()}.${ext}`;
      msg("productMessage","Mengunggah foto…");
      const {error:upErr}=await supabase.storage.from("product-images").upload(imagePath,file,{contentType:file.type,upsert:false});
      if(upErr){msg("productMessage","Gagal mengunggah foto: "+upErr.message,"error");return;}
      const {data:pub}=supabase.storage.from("product-images").getPublicUrl(imagePath);imageUrl=pub.publicUrl;
    }
    const oldId=$("productId").value;
    const payload={store_id:currentProfile.id,name,description:$("productDescription").value.trim(),price,stock,image_url:imageUrl,image_path:imagePath||undefined,is_published:$("productPublished").checked};
    let result;
    if(oldId){
      const updatePayload={...payload};if(!imagePath){delete updatePayload.image_path;}
      result=await supabase.from("products").update(updatePayload).eq("id",oldId).select().single();
    }else result=await supabase.from("products").insert(payload).select().single();
    if(result.error){msg("productMessage","Gagal menyimpan produk: "+result.error.message,"error");return;}
    msg("productMessage","Produk berhasil disimpan.","success");resetProductForm();await loadMyProducts();await loadPublicProducts();
  }
  function init() {
    $("openAuth").onclick=$("heroLogin").onclick=()=>{showTab("login");$("akun").scrollIntoView({behavior:"smooth"});};
    document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>showTab(b.dataset.tab)));
    $("authForm").addEventListener("submit",handleAuth);$("productForm").addEventListener("submit",saveProduct);
    $("cancelEdit").onclick=resetProductForm;$("refreshProducts").onclick=loadPublicProducts;
    $("logout").onclick=async()=>{await supabase.auth.signOut();await updateAuthUI();};
    if(!ready){$("publicProducts").innerHTML='<div class="empty-state">Website siap secara visual. Isi URL dan publishable key Supabase di config.js untuk mengaktifkan login, database, dan unggah produk.</div>';msg("authMessage","Supabase belum dikonfigurasi.");return;}
    if(!window.supabase){msg("authMessage","Library Supabase gagal dimuat. Periksa koneksi internet.");return;}
    supabase=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_PUBLISHABLE_KEY);
    supabase.auth.onAuthStateChange(()=>setTimeout(updateAuthUI,0));
    updateAuthUI();loadPublicProducts();
    const slug=new URLSearchParams(location.search).get("shop");if(slug)loadStore(slug);
  }
  document.addEventListener("DOMContentLoaded",init);
})();