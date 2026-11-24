// Modulo de integracao com o GitHub Actions / GHCR.

import { Module } from '@nestjs/common';
import { GitHubActionsService } from './github-actions.service';

@Module({
  providers: [GitHubActionsService],
  exports: [GitHubActionsService],
})
export class GithubModule {}
