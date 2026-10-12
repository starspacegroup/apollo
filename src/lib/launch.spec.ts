import { describe, it, expect } from 'vitest';
import { landing } from './launch';

const board = {
	discord: {
		channels: [
			{ id: '1559093465357488160', project: 'Apollo', room: null, kind: 'voice' as const },
			{ id: '1547157028466720798', project: 'Apollo', room: 'Apollo', kind: 'text' as const },
			{
				id: '1556485256322752543',
				project: 'Apollo',
				room: 'Apollo#engineering',
				kind: 'text' as const
			}
		]
	}
};

describe('where a launch lands', () => {
	it("a project's voice channel opens that project", () => {
		expect(landing(board, '1559093465357488160')).toBe('/activity/Apollo');
	});
	it('the general text channel opens the project too', () => {
		expect(landing(board, '1547157028466720798')).toBe('/activity/Apollo');
	});
	it('a sub-channel opens the project on that room', () => {
		expect(landing(board, '1556485256322752543')).toBe(
			'/activity/Apollo?room=Apollo%23engineering'
		);
	});
	it('anywhere else asks', () => {
		expect(landing(board, '1')).toBeNull();
		expect(landing(board, null)).toBeNull();
		expect(landing({ discord: undefined }, '1559093465357488160')).toBeNull();
	});
});
