import {buildPlannerContextMessage} from './plannerInteraction';

test('builds an optimization message without pretending there are selections', () => {
    expect(buildPlannerContextMessage(1, [], [])).toBe('请基于第 1 天当前行程进行优化。');
    expect(buildPlannerContextMessage(1, ['外滩', '豫园'], [])).toBe('请基于第 1 天已选地点：外滩、豫园，优化当天行程。');
    expect(buildPlannerContextMessage(1, [], ['放慢节奏', '减少换乘']))
        .toBe('请将第 1 天行程应用偏好：放慢节奏、减少换乘并重新优化。');
    expect(buildPlannerContextMessage(1, ['外滩'], ['放慢节奏']))
        .toBe('请基于第 1 天已选地点：外滩，并应用偏好：放慢节奏，优化当天行程。');
});
