import os
from git import Repo, exc
import json

class GitSkill:
    """
    A Skill for AionUI to perform Git operations.
    Designed to be imported or run as a CLI.
    """
    def __init__(self, path=None):
        self.path = path or os.getcwd()
        try:
            self.repo = Repo(self.path, search_parent_directories=True)
        except exc.InvalidGitRepositoryError:
            self.repo = None

    def status(self):
        if not self.repo: return "Error: Not a git repository."
        return self.repo.git.status()

    def log(self, max_count=5):
        if not self.repo: return "Error: Not a git repository."
        commits = list(self.repo.iter_commits(max_count=max_count))
        result = []
        for c in commits:
            result.append(f"{c.hexsha[:7]} - {c.author.name}: {c.summary} ({c.authored_datetime})")
        return "\n".join(result)

    def diff(self):
        if not self.repo: return "Error: Not a git repository."
        return self.repo.git.diff()

    def commit(self, message, files=None):
        if not self.repo: return "Error: Not a git repository."
        if files:
            self.repo.index.add(files)
        else:
            self.repo.git.add(A=True)
        return self.repo.index.commit(message).hexsha

    def push(self):
        if not self.repo: return "Error: Not a git repository."
        try:
            origin = self.repo.remote(name='origin')
            origin.push()
            return "Push successful."
        except Exception as e:
            return f"Push failed: {str(e)}"

    def pull(self):
        if not self.repo: return "Error: Not a git repository."
        try:
            origin = self.repo.remote(name='origin')
            origin.pull()
            return "Pull successful."
        except Exception as e:
            return f"Pull failed: {str(e)}"

def run_git_tool(action, **kwargs):
    skill = GitSkill()
    method = getattr(skill, action, None)
    if method:
        return method(**kwargs)
    return f"Error: Unknown action '{action}'"

if __name__ == "__main__":
    import fire
    fire.Fire(run_git_tool)
