import { describe, it, expect } from 'vitest';
import { emptyBoard } from '$lib/board';
import {
	levelFor,
	mayAsk,
	memberId,
	parseOwners,
	sessionMemberId,
	viewerOf,
	visibleBoard,
	type Grant
} from './access';

const g = (member: string, project: string, level: Grant['level']): Grant => ({
	member,
	project,
	level,
	granted_by: 'discord:1',
	granted_at: 0
});

describe('who holds what', () => {
	it('names a member by the door they came in', () => {
		expect(memberId('discord', '42')).toBe('discord:42');
		expect(sessionMemberId({ id: '42', provider: 'discord' })).toBe('discord:42');
		expect(sessionMemberId({ id: '7' })).toBe('github:7');
		expect(sessionMemberId({})).toBeNull();
		expect(parseOwners(' discord:1, discord:2 ,')).toEqual(['discord:1', 'discord:2']);
		expect(parseOwners(undefined)).toEqual([]);
	});

	it('the owner and an admin manage everything; a guest has their grants', () => {
		expect(levelFor('owner', [], 'Anzu')).toBe('manager');
		expect(levelFor('admin', [], 'Anzu')).toBe('manager');
		expect(levelFor('guest', [], 'Anzu')).toBe('none');
		const grants = [g('discord:9', 'Anzu', 'member'), g('discord:9', '*', 'view')];
		expect(levelFor('guest', grants, 'Anzu')).toBe('member');
		expect(levelFor('guest', grants, 'Apollo')).toBe('view');
	});
});

describe('who may ask for what', () => {
	const jay = [g('discord:9', 'CustomPerfections', 'member'), g('discord:9', 'Anzu', 'manager')];

	it('a member may ask for work on their project and nothing more', () => {
		expect(mayAsk('work.request', { project: 'CustomPerfections' }, 'guest', jay)).toBeNull();
		expect(mayAsk('work.request', { project: 'Apollo' }, 'guest', jay)).toMatch(/not a member/);
		expect(mayAsk('project.pause', { project: 'CustomPerfections' }, 'guest', jay)).toMatch(
			/manage/
		);
		expect(mayAsk('work.request', {}, 'guest', jay)).toMatch(/names a project/);
	});

	it('a manager may lower their project and never the fleet', () => {
		expect(mayAsk('project.pause', { project: 'Anzu' }, 'guest', jay)).toBeNull();
		expect(mayAsk('switch.off', { capability: 'push', project: 'Anzu' }, 'guest', jay)).toBeNull();
		expect(mayAsk('team.set', { project: 'Anzu', template: 'lean' }, 'guest', jay)).toBeNull();
		expect(mayAsk('autonomy.lower', { level: 'off' }, 'guest', jay)).toMatch(/owner/);
		expect(mayAsk('switch.off', { capability: 'push' }, 'guest', jay)).toMatch(/owner/);
		expect(mayAsk('pause', { minutes: 60 }, 'guest', jay)).toMatch(/owner/);
		expect(mayAsk('attention.resolve', { id: 3 }, 'guest', jay)).toBeNull();
		expect(mayAsk('attention.resolve', { id: 3 }, 'guest', [jay[0]])).toMatch(/manage no project/);
		expect(mayAsk('run', {}, 'guest', jay)).toMatch(/not something/);
	});

	it('the owner and an admin may ask for anything the wire allows', () => {
		expect(mayAsk('pause', { minutes: 60 }, 'owner', [])).toBeNull();
		expect(mayAsk('autonomy.lower', { level: 'off' }, 'admin', [])).toBeNull();
	});
});

describe('the board a person sees', () => {
	function board() {
		const b = emptyBoard('none');
		const project = (name: string, remote: string | null) => ({
			name,
			path: `/home/d/${name}`,
			remote,
			branch: 'main',
			ahead: 0,
			behind: 0,
			dirty: 0,
			dirty_for_minutes: null,
			last_commit_at: null,
			last_commit_summary: null,
			sessions: 0,
			error: null,
			lane: 'quiet' as const,
			logo: null,
			color: null
		});
		b.projects = [project('Anzu', 'davis9001/anzu'), project('Apollo', 'starspacegroup/apollo')];
		b.attention = [
			{ subject: 'Anzu' } as unknown as (typeof b.attention)[number],
			{ subject: 'Apollo' } as unknown as (typeof b.attention)[number]
		];
		b.decisions = [{ project: 'Apollo' } as unknown as (typeof b.decisions)[number]];
		b.actors = [
			{ home: '/home/d/Anzu/x' } as unknown as (typeof b.actors)[number],
			{ home: '/home/d/Apollo' } as unknown as (typeof b.actors)[number]
		];
		b.pull_requests = {
			generated_at: '',
			age_minutes: 0,
			cards: [
				{ repo: 'davis9001/anzu' } as unknown as NonNullable<
					typeof b.pull_requests
				>['cards'][number],
				{ repo: 'starspacegroup/apollo' } as unknown as NonNullable<
					typeof b.pull_requests
				>['cards'][number]
			]
		} as NonNullable<typeof b.pull_requests>;
		b.switches = {
			off: [],
			capabilities: [],
			projects: [{ name: 'Apollo', focus: 'paused', autonomy: null, off: [], merge: null }],
			characters: []
		};
		return b;
	}

	it('a guest sees their projects and nothing about the others', () => {
		const me = {
			id: 'discord:9',
			name: 'Jay',
			avatar: null,
			role: 'guest' as const,
			first_seen: 0,
			last_seen: 0
		};
		const grants = [g('discord:9', 'Anzu', 'member')];
		const v = visibleBoard(board(), viewerOf(me, grants, board()));
		expect(v.projects.map((p) => p.name)).toEqual(['Anzu']);
		expect(v.attention.length).toBe(1);
		expect(v.decisions.length).toBe(0);
		expect(v.actors.length).toBe(1);
		expect(v.pull_requests?.cards.length).toBe(1);
		expect(v.switches?.projects.length).toBe(0);
		expect(v.viewer?.projects).toEqual({ Anzu: 'member' });
		expect(v.viewer?.everywhere).toBe('none');
	});

	it('a guest with nothing is told so, and the owner sees the whole board', () => {
		const nobody = {
			id: 'discord:8',
			name: 'X',
			avatar: null,
			role: 'guest' as const,
			first_seen: 0,
			last_seen: 0
		};
		const v = visibleBoard(board(), viewerOf(nobody, [], board()));
		expect(v.projects).toEqual([]);
		expect(v.caveats.some((c) => c.includes('no access'))).toBe(true);
		const owner = { ...nobody, role: 'owner' as const };
		const w = visibleBoard(board(), viewerOf(owner, [], board()));
		expect(w.projects.length).toBe(2);
		expect(w.viewer?.role).toBe('owner');
	});
});
