import { Component, computed, input } from "@angular/core";
import { PollingWidget } from "../polling-widget";
import { IGithubNotification } from "../../../../Interface/Widget/widget.interface";
import { RelativeTimePipe } from "../../../../Pipe/relative-time.pipe";
import { TranslatePipe } from "../../../../I18n/translate.pipe";


const TYPES: Record<string, { label: string; css: string }> = {
  PullRequest: { label: "PR", css: "pr" },
  Issue: { label: "Issue", css: "issue" },
  Release: { label: "Release", css: "release" },
  Discussion: { label: "Discussion", css: "discussion" },
  CheckSuite: { label: "CI", css: "ci" },
  Commit: { label: "Commit", css: "commit" },
};

@Component({
  selector: "app-github-notifications-widget",
  imports: [RelativeTimePipe, TranslatePipe],
  templateUrl: "./github-notifications-widget.html",
  styleUrls: ["../widget-shared.css", "./github-notifications-widget.css"],
})
export class GithubNotificationsWidget extends PollingWidget<IGithubNotification[]> {
  /** Nombre de notifications (1 à 50). */
  count = input<number>(10);
  /** unread, all ou participating */
  filter = input<"unread" | "all" | "participating">("unread");

  unread = computed(() => (this.data() ?? []).filter((n) => n.unread).length);

  protected override trackInputs(): void {
    this.count();
    this.filter();
  }

  protected fetch(force: boolean) {
    const count = Math.min(50, Math.max(1, Math.round(Number(this.count()) || 10)));
    return this.api.githubNotifications(count, this.filter(), force);
  }

  reason(n: IGithubNotification): string {
    const key = `notif.reason.${n.reason}`;
    return this.i18n.has(key) ? this.i18n.t(key as never) : n.reason;
  }

  type(n: IGithubNotification) {
    return TYPES[n.type] ?? { label: n.type, css: "other" };
  }
}
