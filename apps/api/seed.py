"""
Seed script: creates demo users + 2 sample projects with tasks & changelog.
Run: python seed.py (from apps/api directory)
"""
import asyncio
import os
import sys
from datetime import datetime, timezone

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
                # Demo accounts have no real inbox — never show the verify-email banner
                existing.email_verified_at = existing.email_verified_at or datetime.now(timezone.utc)
                created_users[u_data["email"]] = existing
                print(f"  user already exists: {u_data['email']}")
                continue
            user = User(
                name=u_data["name"],
                email=u_data["email"],
                hashed_password=hash_password(u_data["password"]),
                role=u_data["role"],
                email_verified_at=datetime.now(timezone.utc),
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
                Engineer(name="Backend Bobby",   template="backend",    skills_markdown="Python, FastAPI, SQLAlchemy, PostgreSQL, Alembic, pytest",   status=EngineerStatus.idle,    owner_id=admin.id, organization_id=admin_org.id),
                Engineer(name="Full-stack Fiona",template="fullstack",  skills_markdown="React + FastAPI, Docker, GitHub Actions, AWS S3",            status=EngineerStatus.idle,    owner_id=admin.id, organization_id=admin_org.id),
            ]
            for eng in engineers:
                db.add(eng)
            print("  created 3 seed engineers")

        # ── Workflows from the built-in templates ─────────────────────────────
        from services.sdlc import merge_ai_criteria, workflow_for_template
        spec_wf = await workflow_for_template(db, "spec-driven", admin.id, admin_org.id)
        await workflow_for_template(db, "classic", admin.id, admin_org.id)
        print(f"  workflows ready: {spec_wf.name}, classic")

        # ── Project 3: a spec-driven project ready to run ──────────────────────
        result = await db.execute(select(Project).where(Project.name == "Invoice Exports"))
        if not result.scalar_one_or_none():
            p3 = Project(name="Invoice Exports", status=ProjectStatus.setup, owner_id=admin.id,
                         organization_id=admin_org.id, workflow_id=spec_wf.id)
            db.add(p3)
            await db.flush()
            specs = [
                ("Export invoices as CSV", "Finance needs to download a month of invoices for reconciliation.",
                 ["Given a month with invoices, when finance exports it, then a CSV with one row per invoice downloads",
                  "Given a month with no invoices, when finance exports it, then they see an empty-state message"]),
                ("Email a monthly invoice digest", "Account owners get a summary of last month's invoices on the 1st.", []),
                ("Flag overdue invoices on the dashboard", "Overdue invoices should stand out so collections can act on them.",
                 ["Given an invoice past its due date, when the dashboard loads, then it is marked overdue"]),
            ]
            for i, (title, description, criteria) in enumerate(specs):
                t = Task(project_id=p3.id, title=title, description=description, priority=TaskPriority.high if i == 0 else TaskPriority.medium,
                         type=TaskType.feature, position=i)
                if criteria:
                    t.acceptance_criteria = [dict(c, source="human") for c in merge_ai_criteria(None, criteria)]
                db.add(t)
            print("  created project: Invoice Exports (spec-driven workflow — press Run)")

        # ── Knowledge base ────────────────────────────────────────────────────
        from models.sdlc import KnowledgeEntry, KnowledgeKind, KnowledgeStatus
        from models.task_run import CommentAuthorType
        result = await db.execute(select(KnowledgeEntry).where(KnowledgeEntry.organization_id == admin_org.id))
        if not result.scalars().first():
            entries = [
                (KnowledgeKind.decision, KnowledgeStatus.accepted, 1, "PostgreSQL is the system of record",
                 "**Context** — we need relational integrity for billing data.\n\n**Decision** — all durable state lives in "
                 "PostgreSQL; caches may be rebuilt at any time.\n\n**Consequences** — no feature may treat Redis as a source of truth."),
                (KnowledgeKind.pattern, KnowledgeStatus.accepted, None, "Stream large exports",
                 "Generate CSV/JSON exports as a streamed response instead of building the file in memory. "
                 "Set `Content-Disposition` and keep a stable column order."),
                (KnowledgeKind.glossary, KnowledgeStatus.accepted, None, "Invoice",
                 "A bill issued to a customer for one billing period. Has a due date; becomes **overdue** after it."),
                (KnowledgeKind.convention, KnowledgeStatus.accepted, None, "API errors",
                 "Errors return `{\"detail\": str}` with a meaningful HTTP status; never 200 with an error body."),
                (KnowledgeKind.runbook, KnowledgeStatus.proposed, None, "Re-sending a failed invoice digest",
                 "1. Find the failed job in the worker logs.\n2. Re-queue it with the original month.\n3. Confirm delivery in the mail provider."),
            ]
            entries += [
                (KnowledgeKind.wiki, KnowledgeStatus.accepted, None, "Billing overview",
                 "How billing fits together, for anyone new to the area.\n\n"
                 "- Every [[Invoice]] is generated from a subscription's billing period and stored per "
                 "[[PostgreSQL is the system of record|the system-of-record decision]].\n"
                 "- Exports follow [[Stream large exports]] so month-end never runs out of memory.\n"
                 "- Errors from the billing API follow the [[API errors]] convention.\n\n"
                 "See also [[Dunning]] — not written yet, which is why it shows as an unresolved link on the map."),
            ]
            from services.knowledge_graph import slugify
            seeded: dict[str, KnowledgeEntry] = {}
            for kind, status, number, title, body in entries:
                entry = KnowledgeEntry(
                    organization_id=admin_org.id, kind=kind, status=status, number=number, title=title,
                    body_markdown=body, created_by_id=admin.id, slug=slugify(title),
                    author_type=CommentAuthorType.ai if status == KnowledgeStatus.proposed else CommentAuthorType.human,
                )
                db.add(entry)
                seeded[title] = entry
            await db.flush()
            # The glossary term sits under the wiki overview
            seeded["Invoice"].parent_id = seeded["Billing overview"].id
            print("  created knowledge base (5 accepted, 1 proposed) with wikilinks")

        # ── External links ────────────────────────────────────────────────────
        from models.link import ExternalLink, LinkEntityType, LinkKind
        if not (await db.execute(select(ExternalLink).where(ExternalLink.organization_id == admin_org.id))).scalars().first():
            demo_project = (await db.execute(select(Project).where(
                Project.organization_id == admin_org.id).order_by(Project.created_at))).scalars().first()
            if demo_project is not None:
                for title, url, kind in (
                    ("Billing design file", "https://www.figma.com/", LinkKind.design),
                    ("Billing service dashboard", "https://grafana.com/", LinkKind.dashboard),
                    ("Stripe API reference", "https://docs.stripe.com/api", LinkKind.spec),
                ):
                    db.add(ExternalLink(organization_id=admin_org.id, entity_type=LinkEntityType.project,
                                        entity_id=demo_project.id, url=url, title=title, kind=kind,
                                        created_by_id=admin.id))
                print("  created external links")

        # ── Agent harness ─────────────────────────────────────────────────────
        from models.harness import AgentHarness
        from services.harness import template_fields
        if not (await db.execute(select(AgentHarness).where(AgentHarness.organization_id == admin_org.id))).scalars().first():
            db.add(AgentHarness(organization_id=admin_org.id, owner_id=admin.id, is_default=True,
                                **template_fields("spec-driven")))
            db.add(AgentHarness(organization_id=admin_org.id, owner_id=admin.id, **template_fields("read-only")))
            print("  created agent harnesses (Spec-driven as default, Read-only analysis)")

        await db.commit()
        print("\nSeed complete! Demo credentials:")
        print(f"  email: admin@gravel.dev   password: {DEMO_PASSWORD}")
        print(f"  email: dev@gravel.dev     password: {DEMO_PASSWORD}")
        print(f"  email: qa@gravel.dev      password: {DEMO_PASSWORD}")
        print(f"  email: pm@gravel.dev      password: {DEMO_PASSWORD}")
        print(f"  email: devops@gravel.dev  password: {DEMO_PASSWORD}")


if __name__ == "__main__":
    asyncio.run(seed())
