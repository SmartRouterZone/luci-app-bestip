'use strict';
'require view';
'require poll';
'require rpc';
'require dom';
'require ui';
'require uci';

var callStatus  = rpc.declare({ object: 'bestip', method: 'status', params: [ 'section' ], expect: { '': {} } });
var callHistory = rpc.declare({ object: 'bestip', method: 'history', params: [ 'count', 'section' ], expect: { '': {} } });
var callRun     = rpc.declare({ object: 'bestip', method: 'run', params: [ 'section' ], expect: {} });

function ms(v) {
	if (v === null || v === undefined || v <= 0 || v >= 90000)
		return '—';
	return Math.round(v) + ' ms';
}

function range(a, b) {
	if (!a || !b)
		return '—';
	return a + '–' + b + ' ms';
}

function ratioTip(c) {
	if (!c.ratio || !c.rtt)
		return '';
	return 'ping:443 最慢 ' + c.rtt_max + ' ms ÷ 中位数 ' + c.rtt + ' ms = ' + (c.ratio / 100).toFixed(1) + ' 倍';
}

function clock(ts) {
	if (!ts)
		return '—';
	return new Date(ts * 1000).toLocaleTimeString();
}

function row(title, value) {
	return E('div', { 'class': 'cbi-value' }, [
		E('label', { 'class': 'cbi-value-title' }, [ title ]),
		E('div', { 'class': 'cbi-value-field' }, [ value ])
	]);
}

function statusSection(data, line) {
	var st = data.state || {};
	var cur = st.current || [];
	var enabled = data.enabled !== false;
	var overdue = enabled && st.next_run > 0 && st.next_run * 1000 < Date.now() - 120000;
	var busy = data.busy ? E('em', {}, [ _('拨测中…') ]) : '';
	var hint = [];
	if (!enabled)
		hint.push(_('已停止拨测，当前解析保持不变'));
	if (overdue)
		hint.push(_('调度未运行：上次排期已过，服务可能没在跑'));

	return [
		row(_('状态'), E('span', {}, [
			enabled ? E('strong', {}, [ _('启用') ]) : E('strong', {}, [ _('已停用') ]),
			hint.length ? E('em', {}, [ ' ' + hint.join('；') ]) : ''
		])),
		row(_('解析'), E('span', {}, [
			E('strong', {}, [ st.hostname || 'best.host' ]),
			' → ',
			cur.length ? E('code', {}, [ cur.join(' , ') ]) : E('em', {}, [ _('尚无结果') ]),
			' ',
			busy
		])),
		row(_('本轮结论'), E('span', {}, [ st.reason || '—' ])),
		row(_('上次更新'), E('span', {}, [ clock(st.ts) ])),
		row(_('下次拨测'), E('span', {}, [ enabled ? clock(st.next_run) : E('em', {}, [ _('—') ]) ])),
		row(_('拨测目标'), E('code', {}, [ st.target || '—' ])),
		row(_('操作'), E('div', {}, [
			E('button', {
				'class': 'btn cbi-button cbi-button-apply',
				'click': function() {
					return callRun(line).then(function(r) {
						if (r && r.started)
							ui.addNotification(null, E('p', {}, [ _('已开始一轮拨测，约 20 秒后刷新') ]), 'info');
						else
							ui.addNotification(null, E('p', {}, [ _('已有拨测在运行') ]), 'warning');
					});
				}
			}, [ _('立即拨测') ])
		]))
	];
}

function candidateTable(st) {
	if (!st || !st.candidates || !st.candidates.length)
		return E('p', {}, [ _('暂无数据，等待第一轮结果') ]);

	var head = E('tr', { 'class': 'tr table-titles' }, [
		E('th', { 'class': 'th' }, [ 'IP' ]),
		E('th', { 'class': 'th' }, [ _('落地') ]),
		E('th', { 'class': 'th' }, [ 'ping:443' ]),
		E('th', { 'class': 'th' }, [ _('TLS 握手') ]),
		E('th', { 'class': 'th' }, [ _('抖动范围') ]),
		E('th', { 'class': 'th' }, [ _('失败') ]),
		E('th', { 'class': 'th' }, [ _('分数') ]),
		E('th', { 'class': 'th' }, [ _('状态') ])
	]);

	var body = (st.candidates || []).map(function(c) {
		var tag = c.selected ? (c.current ? _('现任') : _('新选'))
			: (c.qualified ? _('落选') : _('淘汰'));
		var style = c.selected ? { 'font-weight': 'bold' } : {};

		return E('tr', { 'class': 'tr', 'style': style }, [
			E('td', { 'class': 'td' }, [ c.ip ]),
			E('td', { 'class': 'td' }, [ c.pop || '—' ]),
			E('td', { 'class': 'td' }, [ ms(c.rtt) ]),
			E('td', { 'class': 'td' }, [ ms(c.med) ]),
			E('td', { 'class': 'td', 'title': ratioTip(c) }, [
				range(c.rtt_min, c.rtt_max),
				c.unstable ? E('span', { 'style': 'color:#e57373' }, [ ' ⚠' ]) : ''
			]),
			E('td', { 'class': 'td' }, [ String(c.fails || 0) ]),
			E('td', { 'class': 'td' }, [ c.qualified ? String(c.score) : '—' ]),
			E('td', { 'class': 'td' }, [ tag ])
		]);
	});

	var basis = [
		_('门槛：失败 ≤ 1 次、握手中位数 ≤ 2000 ms、抖动 ≤ 2 倍，全部通过才算合格。'),
		_('排序：合格 → 稳定 → 握手中位数 → 首字节，取前 2 个。'),
		_('切换：现任合格时，挑战者需领先 15% 且连续 2 轮；现任不合格则立即切换。')
	];

	var notes = [
		[ _('ping:443'), _('TCP 建连 443 端口耗时，即 tcping:443，非 ICMP；5 次取中位数。') ],
		[ _('TLS 握手'), _('自请求发起到 TLS 握手完成，含建连耗时；受本机 CPU 影响，仅供参考。') ],
		[ _('抖动范围'), _('5 次建连耗时的最小值–最大值；⚠ 表示最大值超过中位数 2 倍。') ],
		[ _('失败'), _('5 次中连接失败次数；超过上限（默认 1 次）判为淘汰。') ],
		[ _('分数'), _('0–100 综合评分，仅展示，不参与选路。') ],
		[ _('状态'), _('现任：生效中；新选：本轮选中，下轮生效；落选：合格未入选；淘汰：未过门槛。') ]
	];

	// 注意：LuCI 的 E() 不展开嵌套数组，子节点必须平铺传入，
	// 否则数组会被字符串化成 [object HTMLElement]
	var li = function() {
		return E('li', { 'style': 'margin:.12em 0' }, Array.prototype.slice.call(arguments));
	};

	var noteBox = E('div', {
		'style': 'margin-top:1em;padding:.6em .9em;border-radius:4px;' +
			'background:rgba(128,128,128,.14);color:#666;font-size:12px;line-height:1.75'
	}, [
		E('div', { 'style': 'font-weight:bold;margin-bottom:.25em' }, [ _('说明') ]),
		E('ul', { 'style': 'margin:0;padding-left:1.1em' }, [
			E('li', {}, [
				E('strong', {}, [ _('优选依据') ]), '：',
				E('ul', { 'style': 'margin:.15em 0 .55em;padding-left:1.1em;list-style:circle' },
					basis.map(function(t) { return li(t); }))
			])
		].concat(notes.map(function(kv) {
			return li(E('strong', {}, [ kv[0] ]), '：' + kv[1]);
		})))
	]);

	return E('div', {}, [
		E('table', { 'class': 'table' }, [ head ].concat(body)),
		noteBox
	]);
}

function chartSvg(hist) {
	var recs = (hist || []).slice(-96);
	if (recs.length < 2)
		return E('p', {}, [ _('历史数据不足') ]);

	var W = 620, H = 130, PAD = 24;
	var series = [ [], [] ], vmax = 1;

	recs.forEach(function(r, i) {
		for (var k = 0; k < 2; k++) {
			var s = (r.sel || [])[k];
			if (s && s.med > 0) {
				series[k].push([ i, s.med ]);
				vmax = Math.max(vmax, s.med);
			}
		}
	});

	function x(i) { return PAD + i * (W - 2 * PAD) / Math.max(1, recs.length - 1); }
	function y(v) { return H - PAD - v * (H - 2 * PAD) / (vmax * 1.1); }

	function line(pts, color) {
		if (!pts.length)
			return '';
		return '<polyline fill="none" stroke="' + color + '" stroke-width="2" points="' +
			pts.map(function(p) { return x(p[0]).toFixed(1) + ',' + y(p[1]).toFixed(1); }).join(' ') +
			'"/>';
	}

	var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="' + H + '">' +
		'<line x1="' + PAD + '" y1="' + (H - PAD) + '" x2="' + (W - PAD) + '" y2="' + (H - PAD) + '" stroke="#888" stroke-opacity="0.35"/>' +
		line(series[0], '#4c8dff') + line(series[1], '#3cc97a') +
		'<text x="' + PAD + '" y="14" font-size="11" fill="#888">' + Math.round(vmax) + ' ms</text>' +
		'</svg>';

	if (typeof dom.parse === 'function')
		return dom.parse(svg);

	return E('p', {}, [ _('当前 LuCI 版本不支持图表') ]);
}

function chartBlock(hist) {
	return E('div', {}, [
		E('h3', {}, [ '最近 ' + Math.min(96, hist.length) + ' 轮握手延迟' ]),
		chartSvg(hist)
	]);
}

function lineNames() {
	return (uci.sections('bestip', 'bestip') || []).map(function(s) {
		return s.name || s['.name'];
	}).filter(function(n) { return n; });
}

function lineLabel(sid) {
	return uci.get('bestip', sid, 'hostname') || sid;
}

return view.extend({
	load: function() {
		return uci.load('bestip').then(function() {
			var lines = lineNames();
			var line = lines.length ? lines[0] : null;

			return Promise.all([
				lines,
				callStatus(line),
				callHistory(96, line).then(function(r) { return (r && r.records) || []; },
					function() { return []; })
			]);
		});
	},

	render: function(data) {
		var self = this;
		var lines  = data[0] || [];
		var line   = lines.length ? lines[0] : null;
		var status = data[1] || {};
		var hist   = data[2] || [];

		this.statusNode = E('div', { 'class': 'cbi-section' }, [ E('div', {}, statusSection(status, line)) ]);
		this.tableNode  = E('div', { 'class': 'cbi-section' }, [ candidateTable(status.state) ]);
		this.chartNode  = E('div', { 'class': 'cbi-section' }, [ chartBlock(hist) ]);

		function reload() {
			return Promise.all([ callStatus(line), callHistory(96, line) ]).then(function(d) {
				dom.content(self.statusNode, E('div', {}, statusSection(d[0] || {}, line)));
				dom.content(self.tableNode, candidateTable((d[0] || {}).state));
				dom.content(self.chartNode, chartBlock((d[1] && d[1].records) || []));
			});
		}

		var picker = '';

		if (lines.length > 1) {
			picker = E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title' }, [ _('线路') ]),
				E('div', { 'class': 'cbi-value-field' }, [
					E('select', {
						'class': 'cbi-input-select',
						'change': function(ev) {
							line = ev.target.value;
							return reload();
						}
					}, lines.map(function(n) {
						return E('option', { 'value': n, 'selected': (n === line) || null }, [ lineLabel(n) ]);
					}))
				])
			]);
		}

		poll.add(function() {
			return callStatus(line).then(function(d) {
				dom.content(self.statusNode, E('div', {}, statusSection(d, line)));
				dom.content(self.tableNode, candidateTable(d.state));
			});
		}, 5);

		return E('div', {}, [
			picker,
			this.statusNode,
			this.tableNode,
			this.chartNode
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
