
// app.js - front end logic
const apiBase = '';
let products = [];
let cart = {}; // key: productId, value: {product, qty}
const el = id => document.getElementById(id);

// helper: ensure elements exist
function $(selector) { return document.querySelector(selector); }
function $all(selector) { return Array.from(document.querySelectorAll(selector)); }

async function fetchProducts() {
  try {
    const r = await fetch('/api/products');
    products = await r.json() || [];

    // Normalize image URLs to always start with /images/
    products.forEach(p => {
      if (p.images && Array.isArray(p.images) && p.images.length > 0) {
        p.images = p.images.map(src => {
          if (!src) return '/images/p1-1.jpg';
          if (!src.startsWith('/images/')) {
            const filename = src.split('/').pop(); // extract filename only
            return `/images/${filename}`;
          }
          return src;
        });
      } else {
        p.images = ['/images/p1-1.jpg']; // fallback image
      }
    });

    renderProducts();
    updateCartUI();
  } catch (err) {
    console.error('Failed fetching products', err);
    products = [];
    renderProducts();
  }
}

function renderProducts() {
  const grid = el('productsGrid');
  if (!grid) return;
  grid.innerHTML = '';

  products.forEach(p => {
    const div = document.createElement('div');
    div.className = 'card';
    const imageSrc = p.images && p.images[0] ? p.images[0] : '/images/p1-1.jpg';
    div.innerHTML = `
      <img src="${imageSrc}" alt="${escapeHtml(p.name)}">
      <div class="meta">
        <div>
          <div class="name">${escapeHtml(p.name)}</div>
          <div class="small">${escapeHtml(p.origin || '')}</div>
        </div>
        <div class="prices">
          ${p.strikePrice ? `<div class="strike">KES ${p.strikePrice}</div>` : ''}
          <div class="price">KES ${p.price}</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;justify-content:space-between">
        <input class="qty" type="number" min="1" value="1" id="qty-${p._id}" />
        <button class="btn addBtn" data-id="${p._id}">Add to cart</button>
      </div>
    `;

    // clicking whole card shows overlay (but ignore clicks on controls)
    div.addEventListener('click', (ev) => {
      if (ev.target && (ev.target.matches('.addBtn') || ev.target.closest('.qty'))) return;
      showOverlay(p);
    });

    grid.appendChild(div);
  });

  // wire add buttons (delegation isn't necessary here because cards are re-rendered)
  document.querySelectorAll('.addBtn').forEach(btn => {
    btn.removeEventListener('click', addBtnHandler); // safe remove-if-present
    btn.addEventListener('click', addBtnHandler);
  });
}

function addBtnHandler(e) {
  e.stopPropagation();
  const id = this.dataset.id;
  const qtyInput = document.getElementById(`qty-${id}`);
  const qty = parseInt((qtyInput && qtyInput.value) || '1', 10) || 1;
  addToCart(id, qty);
}

function showOverlay(p) {
  const overlay = el('productOverlay');
  const c = el('overlayContent');
  if (!overlay || !c) return;
  // render content
  c.innerHTML = `
    <h2>${escapeHtml(p.name)}</h2>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      ${p.images.map(src => `<img src="${src}" style="width:48%;border-radius:8px;height:200px;object-fit:cover;margin-bottom:8px" />`).join('')}
    </div>
    <p class="small">${escapeHtml(p.origin || '')}</p>
    <p><span class="strike">${p.strikePrice ? 'KES ' + p.strikePrice : ''}</span> <span class="price">KES ${p.price}</span></p>
    <p>${p.discountQty ? `Buy ${p.discountQty}+ get ${p.discountPercent || 0}% off` : ''}</p>
    <div style="display:flex;gap:8px;margin-top:8px">
      <input id="overlayQty" class="qty" type="number" min="1" value="1" />
      <button id="overlayAdd" class="btn addBtn">Add to cart</button>
    </div>
  `;

  // wire overlay add button (fresh DOM, safe to attach)
  const overlayAdd = el('overlayAdd');
  if (overlayAdd) {
    overlayAdd.addEventListener('click', () => {
      const q = parseInt(el('overlayQty').value || '1', 10) || 1;
     addToCart(p._id, q);
     hideOverlay();
     openCart();
   });
  }

  overlay.classList.remove('hidden');
}

function hideOverlay() { el('productOverlay')?.classList.add('hidden'); }
el('closeOverlay')?.addEventListener('click', hideOverlay);

// Cart functions
function addToCart(productId, qty = 1) {
  const p = products.find(x => String(x._id) === String(productId));
  if (!p) return alert('product not found');
  if (!cart[productId]) cart[productId] = { product: p, qty: 0 };
  cart[productId].qty += Number(qty) || 1;
  updateCartUI();
}

function removeFromCart(productId) {
  if (cart[productId]) delete cart[productId];
  updateCartUI();
}

function updateCartUI() {
  const itemsDiv = el('cartItems');
  const arr = Object.values(cart);
  el('cartCount').innerText = arr.reduce((s, i) => s + i.qty, 0);
  let total = 0;

  // ensure cart header has close button
  ensureCartCloseButton();

  if (!itemsDiv) return;

  if (arr.length === 0) {
    itemsDiv.innerHTML = '<div class="small">Cart empty</div>';
    el('cartTotal').innerText = '0';
  } else {
    itemsDiv.innerHTML = arr.map(ci => {
      const subtotal = ci.product.price * ci.qty;
      total += subtotal;
      return `<div class="cart-item" data-id="${ci.product._id}">
        <div>
          <div style="font-weight:700">${escapeHtml(ci.product.name)}</div>
          <div class="small">KES ${ci.product.price} x ${ci.qty} = KES ${subtotal}</div>
        </div>
        <div>
          <div style="display:flex;flex-direction:column;gap:6px">
            <input style="width:64px" type="number" value="${ci.qty}" min="1" data-id="${ci.product._id}" class="cart-qty" />
            <button class="btn cart-remove-btn" data-remove="${ci.product._id}" aria-label="Remove ${escapeHtml(ci.product.name)}">Remove</button>
          </div>
        </div>
      </div>`;
    }).join('');
    el('cartTotal').innerText = total;
  }

  // use event delegation on cartItems to handle remove and qty change
  itemsDiv.removeEventListener('click', cartItemsClickHandler);
  itemsDiv.addEventListener('click', cartItemsClickHandler);

  itemsDiv.removeEventListener('change', cartItemsChangeHandler);
  itemsDiv.addEventListener('change', cartItemsChangeHandler);
}

function cartItemsClickHandler(e) {
  const removeBtn = e.target.closest('[data-remove]');
  if (removeBtn) {
    const id = removeBtn.dataset.remove;
    removeFromCart(id);
  }
}

function cartItemsChangeHandler(e) {
  const qtyInput = e.target.closest('.cart-qty');
  if (qtyInput) {
    const id = qtyInput.dataset.id;
    const val = parseInt(qtyInput.value || '1', 10) || 1;
    if (cart[id]) {
      cart[id].qty = val;
      updateCartUI();
    }
  }
}

// Toggle cart visibility
function ensureCartCloseButton() {
  const panel = el('cartPanel');
  if (!panel) return;
  // if close button exists, nothing to do
  if (panel.querySelector('#cartCloseBtn')) return;

  // find header (h3) or create header container
  let header = panel.querySelector('.cart-header');
  if (!header) {
    const h3 = panel.querySelector('h3');
    if (h3) {
      header = document.createElement('div');
      header.className = 'cart-header';
      // move h3 into header
      header.appendChild(h3);
      panel.insertBefore(header, panel.firstChild);
    } else {
      header = document.createElement('div');
      header.className = 'cart-header';
      panel.insertBefore(header, panel.firstChild);
    }
  }

  // create close button
  const btn = document.createElement('button');
  btn.id = 'cartCloseBtn';
  btn.className = 'close-cart-btn';
  btn.setAttribute('aria-label', 'Close cart');
  btn.innerHTML = 'Close'; // simple X — CSS will style it
  btn.addEventListener('click', () => {
    closeCart();
  });
  // append btn to header (if not already)
  if (!header.querySelector('#cartCloseBtn')) header.appendChild(btn);
}

function openCart() {
  const panel = el('cartPanel');
  if (!panel) return;
  panel.classList.remove('hidden');
  panel.classList.add('open'); // allow CSS transitions on .open
  panel.setAttribute('aria-hidden', 'false');
  ensureCartCloseButton();
}

function closeCart() {
  const panel = el('cartPanel');
  if (!panel) return;
  // hide with same class toggle
  panel.classList.remove('open');
  panel.classList.add('hidden');
  panel.setAttribute('aria-hidden', 'true');
}

el('cartToggle')?.addEventListener('click', () => {
  const panel = el('cartPanel');
  if (!panel) return;
  if (panel.classList.contains('hidden')) openCart(); else closeCart();
});

el('clearCart')?.addEventListener('click', () => { cart = {}; updateCartUI(); });

// Checkout flow
el('checkoutBtn')?.addEventListener('click', () => {
  if (Object.keys(cart).length === 0) return alert('cart empty');
  el('checkoutOverlay')?.classList.remove('hidden');
});

el('closeCheckout')?.addEventListener('click', () => el('checkoutOverlay')?.classList.add('hidden'));

el('checkoutForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const customer = Object.fromEntries(fd.entries());
  const items = Object.values(cart).map(ci => ({
    productId: ci.product._id,
    name: ci.product.name,
    price: ci.product.price,
    quantity: ci.qty
  }));
  try {
    const resp = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, customer })
    });
    const data = await resp.json();
    if (data.authorization_url) {
      window.location.href = data.authorization_url;
    } else {
      alert('failed to initiate payment');
      console.error(data);
    }
  } catch (err) {
    console.error('checkout error', err);
    alert('failed to initiate payment');
  }
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    // close overlay or cart when ESC pressed
    const overlay = el('productOverlay');
    if (overlay && !overlay.classList.contains('hidden')) {
      hideOverlay();
      return;
    }
    const panel = el('cartPanel');
    if (panel && !panel.classList.contains('hidden')) closeCart();
  }
});

// small helpers
function escapeHtml(text = '') {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// On page load
fetchProducts();
updateCartUI();
