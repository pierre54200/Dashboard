import { Component, input } from "@angular/core";
import { of } from "rxjs";
import { PollingWidget } from "../polling-widget";
import { IGithubCommit } from "../../../../Interface/Widget/widget.interface";
import { RelativeTimePipe } from "../../../../Pipe/relative-time.pipe";
import { TranslatePipe } from "../../../../I18n/translate.pipe";

@Component({
  selector: "app-github-commits-widget",
  imports: [RelativeTimePipe, TranslatePipe],
  templateUrl: "./github-commits-widget.html",
  styleUrls: ["../widget-shared.css", "./github-commits-widget.css"],
})
export class GithubCommitsWidget extends PollingWidget<IGithubCommit[]> {
  /** Dépôt au format propriétaire/nom */
  repo = input<string>("");
  /** Nombre de commits (1 à 20). */
  count = input<number>(5);

  protected override trackInputs(): void {
    this.repo();
    this.count();
  }

  protected fetch(force: boolean) {
    const repo = this.repo().trim();
    if (!repo) return of([]);
    const count = Math.min(20, Math.max(1, Math.round(Number(this.count()) || 5)));
    return this.api.githubCommits(repo, count, force);
  }

  repoUrl(): string {
    return `https://github.com/${this.repo().trim()}`;
  }
}
