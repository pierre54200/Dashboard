import { Component, computed } from "@angular/core";
import { PollingWidget } from "../polling-widget";
import { IGithubNotification } from "../../../../Interface/Widget/widget.interface";
import { RelativeTimePipe } from "../../../../Pipe/relative-time.pipe";

const REASONS: Record<string, string> = {
  assign: "Assigné",
  author: "Auteur",
  comment: "Commentaire",
  ci_activity: "CI",
  invitation: "Invitation",
  manual: "Abonné",
  mention: "Mentionné",
  review_requested: "Revue demandée",
  security_alert: "Alerte sécurité",
  state_change: "Changement d'état",
  subscribed: "Abonné",
  team_mention: "Équipe mentionnée",
};

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
  imports: [RelativeTimePipe],
  templateUrl: "./github-notifications-widget.html",
  styleUrls: ["../widget-shared.css", "./github-notifications-widget.css"],
})
export class GithubNotificationsWidget extends PollingWidget<IGithubNotification[]> {
  unread = computed(() => (this.data() ?? []).filter((n) => n.unread).length);

  protected fetch(force: boolean) {
    return this.api.githubNotifications(force);
  }

  reason(n: IGithubNotification): string {
    return REASONS[n.reason] ?? n.reason;
  }

  type(n: IGithubNotification) {
    return TYPES[n.type] ?? { label: n.type, css: "other" };
  }
}
