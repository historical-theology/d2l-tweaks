// ==UserScript==
// @name         Make D2L a bit better
// @namespace    https://gist.github.com/csm123199/4bd7605a47ca89d65699bbbaef474c38
// @version      0.5
// @description  Add QoL changes to D2L's user interface
// @author       https://github.com/csm123199
// @include      https://d2l.*.edu/d2l/le/content/*/viewContent/*/View
// @grant        none
// @updateUrl    https://gist.github.com/csm123199/4bd7605a47ca89d65699bbbaef474c38/raw/d2l-improver.user.js
// ==/UserScript==

// D2L rest api docs
// https://docs.valence.desire2learn.com/res/content.html

{
	
	/* Config */
	const MAKE_NATIVE_ON_LOAD = true;


	/* Code */
	let host = null;
	let url = new URL(document.location);
	if (url.protocol == 'https:' && url.host.match(/^d2l.[a-zA-Z0-9_-]+.edu/)) {
		host = url.host
	} else {
		throw new Error('Bad host for D2L Script (exiting): ', url.host);
	}

	const D2L_DOWNLOAD_ICON = `<span
        class="d2l-icon-custom"
        style="background-image:url('https://s.brightspace.com/lib/bsi/20.20.8-85/images/tier1/download.svg');background-position:0 0;background-repeat:no-repeat;width:18px;height:18px;background-size:18px 18px;"
        >
    </span>`
	const CONTENT_TYPES = {
		PDF: 'pdf',
		MP4: 'mp4',
		Word: 'msword',
		Excel: 'msexcel',
		WebPage: 'webpage',
        ExternalPage: 'extpage', // not sure what the difference is in D2L but... *shrug*?
		Panopto: 'panopto',
		UNKNOWN: 'unknown',
	};
	const PAGE_TITLE_MAP = {
		'PDF document': CONTENT_TYPES.PDF,
		'Word Document': CONTENT_TYPES.Word,
		'Excel Spreadsheet': CONTENT_TYPES.Excel,
	}

	// Types able to be directly downloaded
	const DIRECT_FILES = [
		CONTENT_TYPES.PDF,
		CONTENT_TYPES.MP4,
		CONTENT_TYPES.Word,
		CONTENT_TYPES.Excel,
	];

	// Types that can be shown in the native iframe (even if we have to do some URL mangling to turn it into a PDF or smth)
	const NATIVE_VIEW_COMPAT = [
		CONTENT_TYPES.PDF,
		CONTENT_TYPES.MP4, // have to use link from page for URL seeking
		CONTENT_TYPES.ExternalPage,
		CONTENT_TYPES.WebPage, // maybe?

		CONTENT_TYPES.Word, // Should show PDF ( .d2l-fileviewer-pdf-pdfjs[data-location] )
		
	];

	function getContentType() {
        function isMP4(child) {
            return child.attributes.getNamedItem("data-mediaplayer-src-original") != undefined;
        }
        function isExternalPage(_child) {
			let topicsNewWindow = Object.values(D2L.OR.__g1).map(s => JSON.parse(s)).filter(o => o.N == 'D2L.LE.Content.Desktop.Topic.OpenInNewWindow');
			if(topicsNewWindow.length > 1) {
				console.warn("Not recognizing as external page because multiple URLs showed up as valid:", topicsNewWindow.map(o => o.P[0]));
			}
            return topicsNewWindow.length == 1 && topicsNewWindow[0].P[0];
		}
		
		// Used if types can be narrowed down (eg: WebPage -> Panopto)
		let intermediary = CONTENT_TYPES.UNKNOWN;

		let page_title_view = Array.from(document.getElementsByClassName("d2l-page-title-view"));
		if (page_title_view.length > 1) {
			console.warn("Page title views: ", page_title_view);
			throw new Error("More than one elements of class d2l-page-title-view, unable to determine page types.");
		} else if (page_title_view.length == 1) {
			let ptv = page_title_view[0].textContent.trim();
			switch (ptv) {
				case 'Web Page':
					intermediary = CONTENT_TYPES.WebPage;
					break;
				default:
					if (ptv in PAGE_TITLE_MAP) {
						return PAGE_TITLE_MAP[ptv];
					} else {
						console.warn(`Unknown page title view value: ${ptv}`)
					}
			}
		}

		let content_view = document.getElementById('ContentView');
		if (content_view) {
			console.log(content_view) // Easy reference to #ContentView

			let insideContent = Array.from(content_view.children);
			if (insideContent.length == 0) {
				console.log(`Unknown page contents: 0 elements inside #ContentView`);
			} else if (insideContent.length == 1) {
                let child = insideContent[0];
                if(isMP4(child)) return CONTENT_TYPES.MP4;
                if(isExternalPage(child)) return CONTENT_TYPES.ExternalPage;
			} else {
				console.log(`Unknown page contents: 2+ elements inside #ContentView`);
			}
		} else { // web page??
			console.trace("Web page?");
		}
		return CONTENT_TYPES.UNKNOWN;
	}
	function provideTypeFunctionality(type) {
		// add button to use native iframes for certain types
		// add link to direct download
		let [cls, asset] = new URL(document.URL).pathname.split('/').filter(c => Number.isFinite(Number.parseInt(c)));
		let [url, promMeta] = urlOfD2LAsset(cls, asset);
		let handled = false;

		function getUrl(type, apiUrl) {
			if(type == CONTENT_TYPES.MP4) {
				let vidplayer = document.querySelectorAll('#ContentView .vui-mediaplayer')[0];
				let vidurl = vidplayer.getAttribute('data-mediaplayer-src');
				return [vidurl, url + '?stream=false' ];
			} else if(type == CONTENT_TYPES.ExternalPage) {
				let url = Object.values(D2L.OR.__g1).map(s => JSON.parse(s)).filter(o => o.N == 'D2L.LE.Content.Desktop.Topic.OpenInNewWindow')[0].P[0];
				url = new URL(url);
				url.protocol = "https"; // otherwise iframe won't load b/c D2L is HTTPS
				return [url, null];
			} else if([CONTENT_TYPES.Word, CONTENT_TYPES.Excel].includes(type)) {
				// D2L converts office documents to PDF to preview them inside D2L - use the native PDF viewer instead for interactive viewing
				let awsPDF = document.querySelector('.d2l-fileviewer-pdf-pdfjs').getAttribute('data-location');
				return [awsPDF, url + '?stream=false'];
			} else {
				return [
					NATIVE_VIEW_COMPAT.includes(type) ? apiUrl + '?stream=true' : null,
					DIRECT_FILES.includes(type) ? apiUrl + '?stream=false' : null,
				]
			}
		}

		// interactive is meant for in-browser viewing
		// downloadable is meant for files that can be downloaded by navigating to them
		let [interactive, downloadable] = getUrl(type, url);
		if(interactive) {
			handled = true;
			btn_useNativeIframe(interactive, MAKE_NATIVE_ON_LOAD);
			addTitleLink("Direct Link", interactive);
		}
		if(downloadable) {
			handled = true;
			addTitleLink("Download", downloadable, D2L_DOWNLOAD_ICON);
		}

		if (!handled) {
			console.warn("Unhandled D2L content type from Userscript: ", type);
			console.log("Content type asset url: ", url);
			return promMeta.then(([typ, flname, size]) => {
				console.log("Asset meta for url:", {
					type: typ,
					filename: flname,
					size,
				});
			});
		}
	}

	function btn_useNativeIframe(src, now) {
		//returns promise for native iframe

		function insertIframe() {
			// inject own content iframe
			let ifram = document.createElement('iframe')
			ifram.src = src;
			ifram.style.width = '100%'
			ifram.style.height = '90vh'
			ifram.setAttribute('preload', 'auto');

			replaceContent(ifram)
			return ifram;
		}

		if (now) {
			return Promise.resolve(insertIframe());
		} else {
			// return promise that is fulfilled with iframe
			return new Promise((res, rej) => {
				function btnonclick() {
					// installed as onclick handler => this = `<button>...</button>`
					// remove ourselves since we have served our purpose
					document.querySelector(".d2l-page-title-c .d2l-box-h").removeChild(this);
					res(insertIframe());
				};
				// Note: put button in immediatly, provide link after PDF was downloaded
				addTitleBtn("Use Native Viewer", btnonclick);
			});
		}
	}

	// make content more than 600px high
	function makeContentLong() {
		let docViewer = Array.from(document.getElementsByClassName("d2l-documentViewer"));
		if (docViewer.length > 1) {
			console.warn("There are multiple .d2l-documentViewer elements! Page may be extra long...", docViewer);
		}

		docViewer.forEach(e => { e.style.height = '90vh' });
		console.log("Set doc viewers' height to 90vh");
	}

	// helper functions
	function withinIframe() {
		// https://stackoverflow.com/a/326076/11536614
		try {
			return window.self !== window.top;
		} catch (e) {
			return true; // access denied error
		}
	}
	function addTitleBtn(text, onclick) {
		let hdrBar = document.querySelector(".d2l-page-title-c .d2l-box-h");
		let btn = document.createElement('button');
		btn.innerText = text;
		btn.classList.add('d2l-button');
		btn.style['margin-right'] = '.75rem';
		btn.style.width = 'auto';
		btn.onclick = onclick;
		hdrBar.appendChild(btn);
		return btn;
	}
	function addTitleLink(text, href, prependHTML) {
		let hdrBar = document.querySelector(".d2l-page-title-c .d2l-box-h");
		let link = document.createElement('a');
		link.innerText = text;
		if (prependHTML) {
			link.innerHTML = prependHTML + link.innerHTML;
		}
		link.href = href;
		link.classList.add('d2l-button');
		link.style['margin-right'] = '.75rem';
		link.style.width = 'auto';
		hdrBar.appendChild(link);
		return link;
	}
	function replaceContent(ele) {
		// get content view
		let cv = document.getElementById("ContentView");

		// remove existing content
		while (cv.lastChild) {
			cv.removeChild(cv.lastChild)
		}

		cv.appendChild(ele);
	}
	async function D2LAssetMeta(cls, asset) {
		let f = await fetch(`https://${host}/d2l/api/le/1.34/${cls}/content/topics/${asset}/file`, { method: 'HEAD' });

		// get mime and orig file name, if available
		let type = f.headers.get("content-type");
		let name;
		try {
			name = f.headers.get("content-disposition").match(/filename="(.+)"/)[1];
		} catch (e) {
			// bad match or not in content-disposition, most likely
			name = null;
		}
		let size = Number.parseInt(f.headers.get("content-length"));

		return [type, name, size];
	}
	// Returns [url: string, Promise<[content-type: string, orig-filename: string, size: number]>]
	function urlOfD2LAsset(cls, asset) {
		if (!Number.isFinite(Number.parseInt(cls))) {
			throw new Error(`D2L class ID isn't parsable to a number/ID: '${cls}'`);
		}
		if (!Number.isFinite(Number.parseInt(asset))) {
			throw new Error(`D2L asset ID isn't parsable to a number/ID: '${asset}'`);
		}

		// the ?stream=true tells D2L to use a response header for content to be viewed in the browser, rather than downloaded
		return [
			`https://${host}/d2l/api/le/1.34/${cls}/content/topics/${asset}/file`,
			D2LAssetMeta(cls, asset), // returns promise
		]
	}


	(async function () {
		'use strict';

		if (!withinIframe()) {
			try {
				chrome.runtime.sendMessage("llhmaciggnibnbdokidmbilklceaobae", null);
			} catch (e) {
				if (e.message.includes("Invalid extension id")) {
					console.warn(`D2L userscript includes installing the "HTML5 Video Keyboard Shortcuts" extension for speeding up videos`, `https://chrome.google.com/webstore/detail/llhmaciggnibnbdokidmbilklceaobae`);
				} else {
					throw e;
				}
			}

			try {
				makeContentLong();

				let type = getContentType();
				console.log(`Content Type: ${getContentType()}`);
				await provideTypeFunctionality(type); // wait for it, to catch errors
			} catch (e) {
				console.error("Error occured in userscript", e);
				//alert("Error occured in D2L bettering userscript, error in console.");
			}

		}
	})();
}
