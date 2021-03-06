
interface Capabilities {
	extensions: {
		office_viewer: boolean,
		video_shortcuts: boolean,
	},
	browser: "chrome" | "firefox" | "unknown",
};

interface D2LAssetMetadata {
	type: string,
	filename: string|null,
	size: number,
}

type PageType = Page.Unknown | Page.Content;
namespace Page {
	export interface Unknown {
		type: "unknown";
	}
	export interface Content {
		type: "content";
		class: string;
		asset: string;
	}
}

