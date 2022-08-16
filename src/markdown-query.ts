import { Editor, MarkdownView, MetadataCache, TFile } from "obsidian";

function parseMarkdown(md: string): Map<string, [number, number]> {
	let lines: string[] = md.split(/\r?\n/);
	let sections: Map<string, [number, number]> = new Map();
	let currHeaderLine = 0;
	for (let currLineNum = 0; currLineNum <= lines.length; currLineNum++) {
		if (currLineNum < lines.length - 1) {
			let nextLine = lines[currLineNum + 1];
			if (nextLine.startsWith("#")) {
				sections.set(lines[currHeaderLine], [
					currHeaderLine,
					currLineNum + 1,
				]);
				currHeaderLine = currLineNum + 1;
			}
		} else {
			sections.set(lines[currHeaderLine], [currHeaderLine, currLineNum]);
		}
	}
	return sections;
}

function replaceSection(
	editor: Editor,
	sectionName: string,
	content: string
): void {
	let md: string = editor.getValue();
	let sections: Map<string, [number, number]> = parseMarkdown(md);
	if (sections.has(sectionName)) {
		let headerLevel = "";
		let [start, end]: [number, number] = sections.get(sectionName);
		for (let section of sections.entries()) {
			if (section[0] === sectionName) {
				headerLevel = section[0].split(" ")[0];
				continue;
			}
			if (headerLevel !== "") {
				if (section[0].split(" ")[0].length > headerLevel.length) {
					end = section[1][1];
				} else {
					end = section[1][0];
					break;
				}
			}
		}
		let newSection: string = sectionName + "\n" + content + "\n";
		editor.replaceRange(
			newSection,
			{ line: start, ch: 0 },
			{ line: end, ch: 0 }
		);
	}
}

export async function hello(): Promise<number> {
	let files: TFile[] = this.app.vault.getMarkdownFiles();
	let cache: MetadataCache = this.app.metadataCache;
	let currFilename: string = this.app.workspace.getActiveFile().basename;
	const view = this.app.workspace.getActiveViewOfType(MarkdownView);
	const { vault } = this.app;

	let filteredFiles = files.filter((file) => {
		if (
			!file.path.includes("002_Projects") &&
			!file.path.includes("005_Personal")
		)
			return false;
		const fileCache = cache.getFileCache(file);
		const links = new Set(fileCache["links"]?.map((link) => link.link));
		const tags = new Set(fileCache["tags"]?.map((tags) => tags.tag));
		if (!links.has(currFilename) && !tags.has("#wip")) return false;
		return true;
	});

	// Build Contents
	let completeSection: string = "";
	let incompleteSection: Map<string, string> = new Map();
	for (let file of filteredFiles) {
		let fileContents: string = await vault.cachedRead(file);
		let sections = [...parseMarkdown(fileContents)];
		let lines: string[] = fileContents.split(/\r?\n/);
		let allComplete: string[] = [];
		let allIncomplete: string[] = [];
		for (let section of sections) {
			let sectionLines = lines.slice(section[1][0], section[1][1]);
			if (section[0].includes(currFilename)) {
				let complete = sectionLines.filter((line) =>
					line.includes("- [x]")
				);
				complete = complete.map((x) => `    ${x}\n`);
				allComplete = [...allComplete, ...complete];
			}
			let incomplete = sectionLines.filter((line) =>
				line.includes("- [ ]")
			);
			// Bold today's incomplete (with nesting)
			if (section[0].includes(currFilename)) {
				incomplete = incomplete.map(
					(x) =>
						`${x.slice(0, x.indexOf("]") + 1)} **${
							x.split("[ ] ")[1]
						}**`
				);
			}
			incomplete = incomplete.map((x) => `    ${x}\n`);
			allIncomplete = [...allIncomplete, ...incomplete];
		}
		if (allComplete.length > 0) {
			completeSection += `- [[${file.basename}]]\n`;
			completeSection += allComplete.join("");
		}
		let tags = cache
			.getFileCache(file)
			.tags?.filter((tag) => tag.tag !== "#wip" && tag.tag !== "#todo");
		let joined_tag_string = "#default";
		if (tags?.length > 0) {
			let joined_tags = tags.map((tag) => tag.tag);
			joined_tags.sort();
			joined_tag_string = joined_tags.join(", ");
		}
		let existing = incompleteSection.get(joined_tag_string) || "";
		incompleteSection.set(
			joined_tag_string,
			existing + `- [[${file.basename}]]\n` + allIncomplete.join("")
		);
	}
	let finalIncompleteSection = "";
	let sorted_keys = [...incompleteSection.keys()].filter(
		(x: string) => x !== "#default"
	);
	sorted_keys.push("#default");
	sorted_keys.sort();
	sorted_keys.forEach((tag) => {
		if (incompleteSection.get(tag) !== undefined) {
			finalIncompleteSection += `\n### ${tag}\n\n`;
			finalIncompleteSection += incompleteSection.get(tag);
		}
	});

	replaceSection(view.editor, "## `complete`", completeSection);
	replaceSection(view.editor, "## `incomplete`", finalIncompleteSection);
	return 1;
}
