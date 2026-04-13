const EpubLib = (() => {
  const DB_NAME = 'glr_epub_db';
  const DB_VERSION = 1;

  function initDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        // store for chapter chunks
        if (!db.objectStoreNames.contains('chapters')) {
          db.createObjectStore('chapters', { keyPath: 'id' });
        }
        // store for custom works/books index
        if (!db.objectStoreNames.contains('library')) {
          db.createObjectStore('library', { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function storeChapter(id, data) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('chapters', 'readwrite');
      const store = tx.objectStore('chapters');
      const req = store.put({ id, data });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async function getChapter(id) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('chapters', 'readonly');
      const store = tx.objectStore('chapters');
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result ? req.result.data : null);
      req.onerror = () => reject(req.error);
    });
  }

  async function storeLibraryNav(navWorks) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('library', 'readwrite');
      const store = tx.objectStore('library');
      const req = store.put({ id: 'custom_works', data: navWorks });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async function getLibraryNav() {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('library', 'readonly');
      const store = tx.objectStore('library');
      const req = store.get('custom_works');
      req.onsuccess = () => resolve(req.result ? req.result.data : []);
      req.onerror = () => reject(req.error);
    });
  }

  async function parseEpubBlob(fileBlob, collectionName, bookTitle) {
    const zip = await JSZip.loadAsync(fileBlob);
    
    // Find container.xml
    let containerFile = zip.file("META-INF/container.xml");
    if (!containerFile) throw new Error("Not a valid EPUB: Missing META-INF/container.xml");
    
    const containerXml = await containerFile.async("string");
    const containerDoc = new DOMParser().parseFromString(containerXml, "application/xml");
    const rootfile = containerDoc.querySelector("rootfile");
    if (!rootfile) throw new Error("No rootfile in container.xml");
    
    const opfPath = rootfile.getAttribute("full-path");
    const opfFile = zip.file(opfPath);
    if (!opfFile) throw new Error(`Missing OPF file at ${opfPath}`);
    
    const opfXml = await opfFile.async("string");
    const opfDoc = new DOMParser().parseFromString(opfXml, "application/xml");
    
    const basePath = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';
    
    const manifestNodes = opfDoc.querySelectorAll("manifest > item");
    const manifest = {};
    manifestNodes.forEach(node => {
      manifest[node.getAttribute("id")] = node.getAttribute("href");
    });
    
    const spineNodes = opfDoc.querySelectorAll("spine > itemref");
    const spineIds = Array.from(spineNodes).map(node => node.getAttribute("idref"));
    
    let tocMap = {};
    const spineElement = opfDoc.querySelector("spine");
    if (spineElement) {
      const tocId = spineElement.getAttribute("toc");
      if (tocId && manifest[tocId]) {
        try {
          const ncxPath = basePath + manifest[tocId];
          const ncxFile = zip.file(ncxPath);
          if (ncxFile) {
            const ncxXml = await ncxFile.async("string");
            const ncxDoc = new DOMParser().parseFromString(ncxXml, "application/xml");
            const navPoints = ncxDoc.querySelectorAll("navPoint");
            navPoints.forEach(np => {
              const textNode = np.querySelector("navLabel > text");
              const contentNode = np.querySelector("content");
              if (textNode && contentNode) {
                let src = contentNode.getAttribute("src") || "";
                let srcFile = src.split('#')[0].split('/').pop();
                srcFile = decodeURIComponent(srcFile);
                let fragment = src.includes('#') ? src.split('#')[1] : "";
                if (srcFile) {
                  if (!tocMap[srcFile]) tocMap[srcFile] = [];
                  tocMap[srcFile].push({ fragment, title: textNode.textContent.trim() });
                }
              }
            });
          }
        } catch(e) { console.error("TOC parse error", e); }
      }
    }
    
    let segments = [];
    let bookId = 'book_' + Date.now();
    let chapterIndex = 1;

    let globalSegments = [];
    let activeSeg = null;

    for (const idref of spineIds) {
      if (!manifest[idref]) continue;

      let href = manifest[idref];
      href = decodeURIComponent(href);
      let fullPath = basePath + href;

      const htmlFile = zip.file(fullPath);
      if (!htmlFile) continue;

      const htmlContent = await htmlFile.async("string");
      const htmlDoc = new DOMParser().parseFromString(htmlContent, "text/html");
      
      const baseFilename = href.split('/').pop().split('#')[0];
      const mappings = tocMap[baseFilename] || [];
      
      const anchors = [];
      mappings.forEach(m => {
          let node = null;
          if (m.fragment) {
              node = htmlDoc.getElementById(m.fragment) || htmlDoc.querySelector(`[name="${m.fragment}"]`);
          } else {
              node = htmlDoc.body;
          }
          if (node) {
              anchors.push({ node, title: m.title });
          }
      });
      
      anchors.sort((a, b) => {
          const pos = a.node.compareDocumentPosition(b.node);
          return (pos & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1;
      });

      if (!activeSeg) {
          let defaultTitle = "";
          if (mappings.length > 0 && !mappings[0].fragment) defaultTitle = mappings[0].title;
          if (!defaultTitle) {
            const header = htmlDoc.querySelector("title, h1, h2, h3");
            if (header && header.textContent.trim()) defaultTitle = header.textContent.replace(/\s+/g, " ").trim();
          }
          if (!defaultTitle || defaultTitle.length > 80) defaultTitle = `Section 1`;
          activeSeg = { title: defaultTitle, texts: [] };
          globalSegments.push(activeSeg);
      }

      const pTags = htmlDoc.querySelectorAll("p, h1, h2, h3, h4, h5, h6, li");
      let nextAnchorIdx = 0;
      
      pTags.forEach(p => {
         while (nextAnchorIdx < anchors.length) {
             const anchor = anchors[nextAnchorIdx];
             const pos = anchor.node.compareDocumentPosition(p);
             if ((pos & Node.DOCUMENT_POSITION_CONTAINED_BY) || (pos & Node.DOCUMENT_POSITION_FOLLOWING) || p === anchor.node) {
                 if (activeSeg.texts.length === 0) {
                     activeSeg.title = anchor.title;
                 } else {
                     activeSeg = { title: anchor.title, texts: [] };
                     globalSegments.push(activeSeg);
                 }
                 nextAnchorIdx++;
             } else {
                 break;
             }
         }
         let text = p.textContent.replace(/\s+/g, " ").trim();
         if (text.length > 0) activeSeg.texts.push(text);
      });
    }

    for (const seg of globalSegments) {
        if (seg.texts.length === 0) continue;
        const chapterData = { work: collectionName, book: bookTitle, verses: seg.texts.map(t => ({ text: t })) };
        const chapterId = `custom://${bookId}/ch_${chapterIndex}`;
        await storeChapter(chapterId, chapterData);

        segments.push({ title: seg.title, href: chapterId });
        chapterIndex++;
    }

    if (segments.length === 0) throw new Error("Could not extract any text from this EPUB");

    // Add to library
    let libs = await getLibraryNav();
    let col = libs.find(w => w.title === collectionName);
    if (!col) {
      col = { title: collectionName, books: [] };
      libs.push(col);
    }
    
    col.books.push({
      title: bookTitle,
      segments: segments
    });

    await storeLibraryNav(libs);
    return libs;
  }
  async function deleteCollection(colTitle) {
      let libs = await getLibraryNav();
      let col = libs.find(w => w.title === colTitle);
      if (!col) return libs;
      
      const db = await initDB();
      const tx = db.transaction('chapters', 'readwrite');
      const store = tx.objectStore('chapters');
      
      col.books.forEach(b => {
          if (b.segments) b.segments.forEach(s => store.delete(s.href));
      });
      
      libs = libs.filter(w => w.title !== colTitle);
      await storeLibraryNav(libs);
      return libs;
  }

  return {
    getChapter,
    getLibraryNav,
    parseEpubBlob,
    deleteCollection
  };
})();
