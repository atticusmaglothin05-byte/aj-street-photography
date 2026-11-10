const $ = id => document.getElementById(id);
const viewer = $('viewer');
let photographs = []; let active = 0;

function caption(photo, container) {
  container.replaceChildren();
  if (photo.name) { const name = document.createElement('span'); name.textContent = photo.name; container.append(name); }
  const details = [photo.location, photo.date].filter(Boolean);
  if (details.length) { const meta = document.createElement('span'); meta.className = 'caption-meta'; meta.textContent = details.join(' · '); container.append(meta); }
  if (photo.description) { const description = document.createElement('p'); description.className = 'description'; description.textContent = photo.description; container.append(description); }
  container.hidden = !container.childElementCount;
}

function show(index) {
  active = (index + photographs.length) % photographs.length;
  const photo = photographs[active];
  $('viewer-image').src = photo.src;
  $('viewer-image').alt = photo.alt || '';
  caption(photo, $('viewer-caption'));
  $('previous').hidden = $('next').hidden = photographs.length < 2;
  if (!viewer.open) viewer.showModal();
}
$('close').addEventListener('click', () => viewer.close());
$('previous').addEventListener('click', () => show(active - 1));
$('next').addEventListener('click', () => show(active + 1));
viewer.addEventListener('keydown', event => {
  if (event.key === 'ArrowLeft') { event.preventDefault(); show(active - 1); }
  if (event.key === 'ArrowRight') { event.preventDefault(); show(active + 1); }
});

async function load() {
  try {
    const response = await fetch('portfolio.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error('Unable to load portfolio.');
    const { settings, photos } = await response.json();
    photographs = photos;
    document.title = settings.title;
    $('wordmark').textContent = $('footer-title').textContent = settings.name || settings.title;
    if (settings.logo) { const logo = document.createElement('img'); logo.src = settings.logo; logo.alt = ''; const name = document.createElement('span'); name.textContent = settings.name || settings.title; $('wordmark').replaceChildren(logo, name); }
    for (const [id, value] of [['owner', settings.name], ['intro', settings.intro]]) if (value) { $(id).textContent = value; $(id).hidden = false; }
    if (settings.instagram) {
      const url = new URL(settings.instagram);
      if (url.protocol === 'https:' && ['instagram.com', 'www.instagram.com'].includes(url.hostname)) { $('instagram').href = url.href; $('instagram').hidden = false; }
    }
    photos.forEach((photo, index) => {
      const figure = document.createElement('figure'); const button = document.createElement('button'); const image = document.createElement('img'); const text = document.createElement('figcaption');
      button.type = 'button'; button.className = 'photo'; button.setAttribute('aria-label', photo.name ? `Open ${photo.name}` : 'Open photograph'); button.setAttribute('aria-haspopup', 'dialog');
      image.src = photo.thumbnail; image.alt = photo.alt || ''; image.width = photo.width; image.height = photo.height; image.loading = 'lazy'; image.decoding = 'async';
      button.append(image); button.addEventListener('click', () => show(index)); caption(photo, text); figure.append(button, text); $('gallery').append(figure);
    });
    if (photos.length) {
      const featured = Math.max(0, photos.findIndex(photo => photo.name === 'Umbrella Man'));
      $('hero-image').src = photos[featured].src;
      $('hero-image').alt = photos[featured].alt || '';
      $('hero-photo').hidden = false;
      $('hero-photo').addEventListener('click', () => show(featured));
    }
    $('empty').hidden = photos.length > 0;
    if (photos.length) { $('count').textContent = `${String(photos.length).padStart(2, '0')} photographs`; $('count').hidden = false; }
  } catch { $('error').hidden = false; }
}
load();
