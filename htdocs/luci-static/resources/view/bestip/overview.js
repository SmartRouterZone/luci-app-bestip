'use strict';
'require view';
'require poll';
'require rpc';
'require dom';
'require ui';

var callStatus  = rpc.declare({ object: 'bestip', method: 'status', expect: { '': {} } });
var callHistory = rpc.declare({ object: 'bestip', method: 'history', params: [ 'count' ], expect: { '': {} } });
var callRun     = rpc.declare({ object: 'bestip', method: 'run', expect: {} });

function ms(v) {
	if (v === null || v === undefined || v <= 0 || v >= 90000)
		return '—';
	return Math.round(v) + ' ms';
}

function range(a, b) {
	if (a === null || a === undefined || b === null || b === undefined)
		return '—';
	return a + '–' + b + ' ms';
}

function ratioTip(c) {
	if (!c.ratio || !c.med)
		return '';
	return '最慢 ' + c.max + ' ms ÷ 中位数 ' + c.med + ' ms = ' + (c.ratio / 100).toFixed(1) + ' 倍';
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

function statusSection(data) {
	var st = data.state || {};
	var cur = st.current || [];
	var busy = data.busy ? E('em', {}, [ _('拨测中…') ]) : '';

	return [
		row(_('解析'), E('span', {}, [
			E('strong', {}, [ st.hostname || 'best.local' ]),
			' → ',
			cur.length ? E('code', {}, [ cur.join(' , ') ]) : E('em', {}, [ _('尚无结果') ]),
			' ',
			busy
		])),
		row(_('本轮结论'), E('span', {}, [ st.reason || '—' ])),
		row(_('上次更新'), E('span', {}, [ clock(st.ts) ])),
		row(_('下次拨测'), E('span', {}, [ clock(st.next_run) ])),
		row(_('拨测目标'), E('code', {}, [ st.target || '—' ])),
		row(_('操作'), E('div', {}, [
			E('button', {
				'class': 'btn cbi-button cbi-button-apply',
				'click': function() {
					return callRun().then(function(r) {
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
			E('td', { 'class': 'td' }, [ ms(c.med) ]),
			E('td', { 'class': 'td', 'title': ratioTip(c) }, [
				range(c.min, c.max),
				c.unstable ? E('span', { 'style': 'color:#e57373' }, [ ' ⚠' ]) : ''
			]),
			E('td', { 'class': 'td' }, [ String(c.fails || 0) ]),
			E('td', { 'class': 'td' }, [ c.qualified ? String(c.score) : '—' ]),
			E('td', { 'class': 'td' }, [ tag ])
		]);
	});

	return E('div', {}, [
		E('table', { 'class': 'table' }, [ head ].concat(body)),
		E('p', { 'class': 'cbi-section-descr' }, [
			_('⚠ 表示最慢一次超过中位数的 2 倍（鼠标悬停可看具体倍数），这类 IP 会被排到后面。')
		])
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

return view.extend({
	load: function() {
		return Promise.all([
			callStatus(),
			callHistory(96).then(function(r) { return (r && r.records) || []; },
				function() { return []; })
		]);
	},

	render: function(data) {
		var self = this;
		var status = data[0] || {};
		var hist = data[1] || [];

		this.statusNode = E('div', { 'class': 'cbi-section' }, [ E('div', {}, statusSection(status)) ]);
		this.tableNode  = E('div', { 'class': 'cbi-section' }, [ candidateTable(status.state) ]);
		this.chartNode  = E('div', { 'class': 'cbi-section' }, [
			E('h3', {}, [ _('最近 96 轮握手延迟') ]),
			chartSvg(hist)
		]);

		poll.add(function() {
			return callStatus().then(function(d) {
				dom.content(self.statusNode, E('div', {}, statusSection(d)));
				dom.content(self.tableNode, candidateTable(d.state));
			});
		}, 5);

		return E('div', {}, [
			E('h2', {}, [ _('优选 IP') ]),
			this.statusNode,
			this.tableNode,
			this.chartNode
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
