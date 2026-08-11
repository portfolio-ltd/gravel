"""
Seed script: creates demo users + 2 sample projects with tasks & changelog.
Run: python seed.py (from apps/api directory)
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

import models  # noqa
from db.base import Base
from db.session import AsyncSessionLocal, engine
from models.changelog import ChangelogEntry, ChangelogType
from models.engineer import Engineer, EngineerStatus
from models.project import Project, ProjectStatus
from models.task import Task, TaskPriority, TaskStatus, TaskType
from models.user import User, UserRole
from services.auth import hash_password

DEMO_PASSWORD = "demo1234"

SEED_USERS = [
    {"name": "Alex Rivera",   "email": "admin@gravel.dev",  "role": UserRole.admin,     "password": DEMO_PASSWORD},
    {"name": "Sam Chen",      "email": "dev@gravel.dev",    "role": UserRole.developer,  "password": DEMO_PASSWORD},
    {"name": "Jordan Lee",    "email": "qa@gravel.dev",     "role": UserRole.qa,         "password": DEMO_PASSWORD},
    {"name": "Taylor Kim",    "email": "pm@gravel.dev",     "role": UserRole.product,    "password": DEMO_PASSWORD},
    {"name": "Morgan Patel",  "email": "devops@gravel.dev", "role": UserRole.devops,     "password": DEMO_PASSWORD},
]


async def seed():
    # Ensure tables exist
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as db:
        from sqlalchemy import select

        # ── Users ───────────────────────────────────────────────────────────
        created_users: dict[str, User] = {}
        for u_data in SEED_USERS:
            result = await db.execute(select(User).where(User.email == u_data["email"]))
            existing = result.scalar_one_or_none()
            if existing:
                created_users[u_data["email"]] = existing
                print(f"  user already exists: {u_data['email']}")
                continue
            user = User(
                name=u_data["name"],
                email=u_data["email"],
                hashed_password=hash_password(u_data["password"]),
                role=u_data["role"],
            )
            db.add(user)
            await db.flush()
            created_users[u_data["email"]] = user
            print(f"  created user: {u_data['email']}")

        admin = created_users["admin@gravel.dev"]

        # ── Personal organizations ───────────────────────────────────────────
        from services.organizations import ensure_personal_org
        orgs = {}
        for email, u in created_users.items():
            orgs[email] = await ensure_personal_org(db, u)
        admin_org = orgs["admin@gravel.dev"]

        # ── Project 1: Customer Dashboard v2 ──────────────────────────────
        result = await db.execute(select(Project).where(Project.name == "Customer Dashboard v2"))
        if not result.scalar_one_or_none():
            p1 = Project(name="Customer Dashboard v2", status=ProjectStatus.review, progress=72, owner_id=admin.id, organization_id=admin_org.id)
            db.add(p1)
            await db.flush()

            tasks1 = [
                Task(project_id=p1.id, title="Setup authentication with JWT", description="Implement login, logout, refresh token flow", status=TaskStatus.done, priority=TaskPriority.high, type=TaskType.feature, position=0),
                Task(project_id=p1.id, title="Design system component library", description="Create base button, input, card, modal components", status=TaskStatus.done, priority=TaskPriority.high, type=TaskType.design, position=1),
                Task(project_id=p1.id, title="Dashboard layout & navigation", description="Responsive sidebar + top nav + main content area", status=TaskStatus.qa, priority=TaskPriority.high, type=TaskType.feature, position=2),
                Task(project_id=p1.id, title="User profile management", description="Edit profile, avatar upload, password change", status=TaskStatus.in_progress, priority=TaskPriority.medium, type=TaskType.feature, position=3),
                Task(project_id=p1.id, title="Notification system", description="In-app toasts + email triggers via webhook", status=TaskStatus.pending, priority=TaskPriority.medium, type=TaskType.feature, position=4),
                Task(project_id=p1.id, title="Database schema & migrations", description="Users, sessions, projects, tasks tables", status=TaskStatus.done, priority=TaskPriority.high, type=TaskType.infra, position=5),
            ]
            for t in tasks1:
                db.add(t)

            changelog1 = [
                ChangelogEntry(project_id=p1.id, message="Add JWT authentication middleware and refresh token rotation", type=ChangelogType.added, file_path="src/auth/jwt.ts"),
                ChangelogEntry(project_id=p1.id, message="Create responsive Dashboard layout with collapsible sidebar", type=ChangelogType.added, file_path="src/pages/Dashboard.tsx"),
                ChangelogEntry(project_id=p1.id, message="Fix token expiry race condition on concurrent requests", type=ChangelogType.fixed, file_path="src/auth/middleware.ts"),
                ChangelogEntry(project_id=p1.id, message="Database migrations for users and sessions tables", type=ChangelogType.infra, file_path="db/migrations/001_init.sql"),
                ChangelogEntry(project_id=p1.id, message="Design system: Button, Card, Badge, Input, Dialog components", type=ChangelogType.added, file_path="src/components/ui/"),
            ]
            for c in changelog1:
                db.add(c)
            print("  created project: Customer Dashboard v2")

        # ── Project 2: Mobile Auth Redesign ───────────────────────────────
        result = await db.execute(select(Project).where(Project.name == "Mobile Auth Redesign"))
        if not result.scalar_one_or_none():
            p2 = Project(name="Mobile Auth Redesign", status=ProjectStatus.running, progress=38, owner_id=admin.id, organization_id=admin_org.id)
            db.add(p2)
            await db.flush()

            tasks2 = [
                Task(project_id=p2.id, title="Setup authentication with JWT", description="Implement login, logout, refresh token flow", status=TaskStatus.done, priority=TaskPriority.high, type=TaskType.feature, position=0),
                Task(project_id=p2.id, title="Design system component library", description="Create base button, input, card, modal components", status=TaskStatus.done, priority=TaskPriority.high, type=TaskType.design, position=1),
                Task(project_id=p2.id, title="Dashboard layout & navigation", description="Responsive sidebar + top nav", status=TaskStatus.in_progress, priority=TaskPriority.high, type=TaskType.feature, position=2),
                Task(project_id=p2.id, title="User profile management", description="Edit profile, avatar upload", status=TaskStatus.pending, priority=TaskPriority.medium, type=TaskType.feature, position=3),
            ]
            for t in tasks2:
                db.add(t)

            changelog2 = [
                ChangelogEntry(project_id=p2.id, message="Add JWT authentication middleware", type=ChangelogType.added, file_path="src/auth/jwt.ts"),
                ChangelogEntry(project_id=p2.id, message="Create responsive Dashboard layout", type=ChangelogType.added, file_path="src/pages/Dashboard.tsx"),
            ]
            for c in changelog2:
                db.add(c)
            print("  created project: Mobile Auth Redesign")

        # ── Engineers ─────────────────────────────────────────────────────────
        result = await db.execute(select(Engineer).where(Engineer.name == "Frontend Pete"))
        if not result.scalar_one_or_none():
            engineers = [
                Engineer(name="Frontend Pete",   template="frontend",   skills_markdown="React, TypeScript, Tailwind CSS, Next.js App Router, Vitest", status=EngineerStatus.idle,    owner_id=admin.id, organization_id=admin_org.id),
                Engineer(name="Backend Bobby",   template="backend",    skills_markdown="Python, FastAPI, SQLAlchemy, PostgreSQL, Alembic, pytest",   status=EngineerStatus.running, owner_id=admin.id, organization_id=admin_org.id),
                Engineer(name="Full-stack Fiona",template="fullstack",  skills_markdown="React + FastAPI, Docker, GitHub Actions, AWS S3",            status=EngineerStatus.idle,    owner_id=admin.id, organization_id=admin_org.id),
            ]
            for eng in engineers:
                db.add(eng)
            print("  created 3 seed engineers")

        # ── Standard SDLC workflow ────────────────────────────────────────────
        from models.workflow import Workflow, WorkflowStage
        result = await db.execute(
            select(Workflow).where(Workflow.owner_id == admin.id, Workflow.name == "Standard SDLC Pipeline")
        )
        if not result.scalar_one_or_none():
            wf = Workflow(
                owner_id=admin.id,
                organization_id=admin_org.id,
                name="Standard SDLC Pipeline",
                description="Plan → Approve → Build → Test → Deploy with a rework loop from QA back to Build.",
            )
            db.add(wf)
            await db.flush()
            stage_defs = [
                ("AI Grooming",   0, True,  False, "Assess whether the task is implementation-ready. List gaps, risks, and concrete acceptance criteria. Do not implement anything."),
                ("Approval Gate", 1, False, True,  None),
                ("Build",         2, True,  True,  "Implement the task end-to-end on the task branch. Add tests where the codebase has them and run available verification before finishing."),
                ("QA Testing",    3, True,  False, "Verify the implementation against the acceptance criteria. Run the strongest verification available and report concrete evidence."),
                ("Deploy",        4, True,  False, "Prepare and execute the deployment using the project's deploy configuration. Capture evidence such as URLs and logs."),
            ]
            stages = []
            for name, order, ai, approval, instructions in stage_defs:
                s = WorkflowStage(
                    workflow_id=wf.id, name=name, stage_order=order,
                    is_ai_executable=ai, requires_human_approval=approval,
                    stage_instructions=instructions,
                    max_rework_attempts=3,
                )
                db.add(s)
                stages.append(s)
            await db.flush()
            # QA failures loop back to Build
            stages[3].rework_target_stage_id = stages[2].id
            print("  created workflow: Standard SDLC Pipeline (5 stages)")

        await db.commit()
        print("\nSeed complete! Demo credentials:")
        print(f"  email: admin@gravel.dev   password: {DEMO_PASSWORD}")
        print(f"  email: dev@gravel.dev     password: {DEMO_PASSWORD}")
        print(f"  email: qa@gravel.dev      password: {DEMO_PASSWORD}")
        print(f"  email: pm@gravel.dev      password: {DEMO_PASSWORD}")
        print(f"  email: devops@gravel.dev  password: {DEMO_PASSWORD}")


if __name__ == "__main__":
    asyncio.run(seed())
