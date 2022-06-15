import { moment, Plugin, MarkdownView, Editor } from "obsidian";
import { hello } from "./markdown-query";

export default class ExamplePlugin extends Plugin {
	async onload() {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		const saveCommandDefinition = (this.app as any).commands?.commands?.[
			"editor:save-file"
		];
		const save = saveCommandDefinition?.callback;

		this.addCommand({
			id: "fill-day-todolist-items",
			name: "Fill day todo list items",
			callback: () => {
				hello();
				save();
			},
		});
	}

	async averageFileLength(): Promise<number> {
		const { vault } = this.app;
		const fileContents: string[] = await Promise.all(
			vault.getMarkdownFiles().map((file) => vault.cachedRead(file))
		);
		console.log(fileContents[0]);
		return 0;
	}
}
