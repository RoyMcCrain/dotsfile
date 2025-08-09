import {
  BaseSource,
  DduOptions,
  Item,
  SourceOptions,
} from "https://deno.land/x/ddu_vim@v3.10.3/types.ts";
import { Denops } from "https://deno.land/x/ddu_vim@v3.10.3/deps.ts";
import { ActionData } from "https://deno.land/x/ddu_kind_file@v0.7.1/file.ts";

type Params = Record<never, never>;

interface FileStatus {
  file: string;
  status: string;
  staged: boolean;
}

export class Source extends BaseSource<Params> {
  override kind = "file";

  override gather(_args: {
    denops: Denops;
    options: DduOptions;
    sourceOptions: SourceOptions;
    sourceParams: Params;
    input: string;
  }): ReadableStream<Item<ActionData>[]> {
    return new ReadableStream({
      async start(controller) {
        try {
          const fileStatuses: Map<string, FileStatus> = new Map();

          // git diff --name-status でunstagedファイルとステータスを取得
          const unstagedCmd = new Deno.Command("git", {
            args: ["diff", "--name-status"],
            stdout: "piped",
            stderr: "piped",
          });
          const unstagedResult = await unstagedCmd.output();
          
          // git diff --cached --name-status でstagedファイルとステータスを取得
          const stagedCmd = new Deno.Command("git", {
            args: ["diff", "--cached", "--name-status"],
            stdout: "piped",
            stderr: "piped",
          });
          const stagedResult = await stagedCmd.output();

          const decoder = new TextDecoder();
          
          // unstagedファイルを処理
          const unstagedLines = decoder.decode(unstagedResult.stdout)
            .split("\n")
            .filter((line) => line.length > 0);
          
          for (const line of unstagedLines) {
            const [status, ...pathParts] = line.split("\t");
            const file = pathParts.join("\t");
            if (file) {
              fileStatuses.set(file, { file, status, staged: false });
            }
          }

          // stagedファイルを処理
          const stagedLines = decoder.decode(stagedResult.stdout)
            .split("\n")
            .filter((line) => line.length > 0);
          
          for (const line of stagedLines) {
            const [status, ...pathParts] = line.split("\t");
            const file = pathParts.join("\t");
            if (file) {
              const existing = fileStatuses.get(file);
              if (existing) {
                // すでにunstagedにある場合は、staged状態を更新
                existing.staged = true;
              } else {
                fileStatuses.set(file, { file, status, staged: true });
              }
            }
          }

          // ステータスアイコンを決定（シンプルな記号のみ）
          const getStatusIcon = (status: string): string => {
            switch (status) {
              case "A":
                return "+"; // 追加
              case "M":
                return "M"; // 変更
              case "D":
                return "-"; // 削除
              case "R":
                return "R"; // リネーム
              case "C":
                return "C"; // コピー
              case "U":
                return "!"; // マージコンフリクト
              default:
                return "?"; // 不明
            }
          };

          // dduのItemに変換
          const items: Item<ActionData>[] = Array.from(fileStatuses.values())
            .sort((a, b) => {
              // まずstaged/unstagedでソート、次にファイル名でソート
              if (a.staged !== b.staged) {
                return a.staged ? -1 : 1;
              }
              return a.file.localeCompare(b.file);
            })
            .map((fileStatus) => {
              const icon = getStatusIcon(fileStatus.status);
              const stageIndicator = fileStatus.staged ? "●" : " ";
              return {
                word: `${stageIndicator} ${icon} ${fileStatus.file}`,
                action: {
                  path: fileStatus.file,
                  isDirectory: false,
                },
              };
            });

          controller.enqueue(items);
        } catch (e) {
          console.error("Failed to get git diff files:", e);
        } finally {
          controller.close();
        }
      },
    });
  }

  override params(): Params {
    return {};
  }
}
