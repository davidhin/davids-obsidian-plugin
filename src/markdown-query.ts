import { Editor, MarkdownView, MetadataCache, TFile, moment } from "obsidian";

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
	let filteredFiles = files;

	// Build Contents
	let completeSection: string = "";
	let incompleteSection: Map<string, string> = new Map();

	let incompletePast: Map<string, string> = new Map();
	let incompletePresent: Map<string, string> = new Map();
	let incompleteFuture: Map<string, string> = new Map();

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
			let section_date = moment(section[0], "DD-MMM-YYYY");
			let curr_date = moment(currFilename, "DD-MMM-YYYY");
			let incomplete_map = incomplete.map((x) => `    ${x}\n`).join("");
			if (section_date.isBefore(curr_date) && incomplete.length > 0) {
				incompletePast.set(file.basename, incomplete_map);
			} else if (
				section_date.isSame(curr_date) &&
				incomplete.length > 0
			) {
				incompletePresent.set(file.basename, incomplete_map);
			} else if (
				section_date.isAfter(curr_date) &&
				incomplete.length > 0
			) {
				incompleteFuture.set(file.basename, "");
			}
			incomplete = incomplete.map((x) => `    ${x}\n`);
			allIncomplete = [...allIncomplete, ...incomplete];
		}
		if (allComplete.length > 0) {
			completeSection += `- [[${file.basename}]]\n`;
			completeSection += allComplete.join("");
		}
	}

	// Flatten incompletePresent into string
	let incompletePresentString = "";
	incompletePresent.forEach((value, key) => {
		incompletePresentString += `- [[${key}]]\n${value}`;
	});

	// Flatten incompletePast into string
	let incompletePastString = "";
	incompletePast.forEach((value, key) => {
		incompletePastString += `- [[${key}]]\n${value}`;
	});

	// Flatten incompleteFuture into string
	let incompleteFutureString = "";
	incompleteFuture.forEach((value, key) => {
		incompleteFutureString += `- [[${key}]]\n${value}`;
	});

	incompleteSection.set("#current", incompletePresentString);
	if (incompletePastString.length > 0)
		incompleteSection.set("#past", incompletePastString);
	incompleteSection.set("#future", incompleteFutureString);

	let finalIncompleteSection = "";
	let sorted_keys = [...incompleteSection.keys()].filter(
		(x: string) => x !== "#default"
	);
	sorted_keys.push("#default");
	sorted_keys.sort();

	// If #priority is present, put at start of array
	let priority_key = sorted_keys.find((x) => x.includes("#priority"));
	if (priority_key) {
		sorted_keys.splice(sorted_keys.indexOf(priority_key), 1);
		sorted_keys.unshift(priority_key);
	}

	sorted_keys.forEach((tag) => {
		if (incompleteSection.get(tag) !== undefined) {
			finalIncompleteSection += `\n### ${tag}\n\n`;
			finalIncompleteSection += incompleteSection.get(tag);
		}
	});

	if (completeSection.length > 0) {
		completeSection = `\n${completeSection}`;
	}
	replaceSection(view.editor, "## `complete`", completeSection);
	replaceSection(view.editor, "## `incomplete`", finalIncompleteSection);

	// Build Index under ## `task_index`
	let finishedIndex: Map<string, Set<string>> = new Map();
	files.filter((file) => {
		if (
			!file.path.includes("002_Projects") &&
			!file.path.includes("003_Personal")
		)
			return false;
		const fileCache = cache.getFileCache(file);
		const links = new Set(fileCache["links"]?.map((link) => link.link));
		const tags = new Set(fileCache["tags"]?.map((tags) => tags.tag));
		if (links.size > 0) {
			for (let link of links) {
				let taskMoment = moment(link, "DD_MMMM_YYYY");
				// Link includes _ is a workaround to ensure that we are not
				// parsing random dates in links, but means our dates must be
				// formatted with an underscore.
				if (taskMoment.isValid() && link.includes("_")) {
					let taskDate = taskMoment.format("MMMM YYYY");
					if (!finishedIndex.has(taskDate)) {
						finishedIndex.set(taskDate, new Set());
					}
					let dotpoint = `- [[${file.basename}]]`;
					if (tags.size > 0) {
						dotpoint += ` ${Array.from(tags).join(", ")}`;
					}
					finishedIndex.get(taskDate).add(dotpoint);
				}
			}
		}
	});
	let sorted_date_keys = [...finishedIndex.keys()].sort((a, b) =>
		moment(a, "MMMM YYYY").diff(moment(b, "MMMM YYYY"))
	);
	let task_index = "";
	for (let date of sorted_date_keys) {
		task_index += `\n### ${date}\n`;
		task_index += Array.from(finishedIndex.get(date)).join("\n");
		task_index += "\n";
	}
	replaceSection(view.editor, "## `task_index`", task_index);

	return 1;
}
