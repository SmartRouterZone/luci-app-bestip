'use strict';
'require view';
'require form';
'require uci';
'require ui';

/* 新增一条线路：直接填解析域名，段名自动取第一段 */
function addLine(m) {
	var inp = E('input', { 'type': 'text', 'class': 'cbi-input-text', 'placeholder': 'sin.best.host' });
	var msg = E('p', { 'class': 'cbi-input-invalid', 'style': 'display:none' });

	function fail(text) {
		msg.textContent = text;
		msg.style.display = '';
	}

	ui.showModal(_('新增线路'), [
		E('p', {}, _('填新线路的解析域名，例如 sin.best.host；段名自动取第一段。')),
		E('div', { 'class': 'cbi-value' },
			E('div', { 'class': 'cbi-value-field' }, inp)),
		msg,
		E('div', { 'class': 'right' }, [
			E('button', { 'class': 'cbi-button', 'click': ui.hideModal }, _('取消')),
			' ',
			E('button', { 'class': 'cbi-button cbi-button-apply', 'click': function() {
				var host = inp.value.trim().toLowerCase();

				if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host)) {
					fail(_('域名格式不对，例如 sin.best.host'));
					return;
				}

				var taken = {};

				uci.sections('bestip', 'bestip').forEach(function(sec) {
					taken[sec['.name']] = sec['hostname'];
				});

				for (var sid in taken)
					if (taken[sid] === host) {
						fail(_('这条域名已经加过了'));
						return;
					}

				var base = host.split('.')[0].replace(/[^a-z0-9_]/g, '_');
				var name = base;

				for (var n = 2; taken[name] != null; n++)
					name = base + n;

				ui.hideModal();

				uci.add('bestip', 'bestip', name);
				uci.set('bestip', name, 'hostname', host);
				uci.set('bestip', name, 'enabled', '1');

				return uci.save().then(function() {
					ui.changes.init();
				}, function(err) {
					ui.addNotification(_('新增线路未保存'),
						E('p', {}, err && err.message ? err.message : String(err)), 'error');
				}).then(function() {
					return m.render();
				}).then(function(mapEl) {
					tabify(mapEl, m);

					var link = mapEl.querySelector('.cbi-tabmenu [data-tab="' + name + '"] a');
					if (link)
						link.click();
				});
			} }, _('添加'))
		])
	]);
}

/* 标签标题优先取表单里「解析域名」的当前值，取不到再退回 uci 数据 */
function paneHostname(pane, sid) {
	var id = 'cbid.bestip.' + sid + '.hostname';
	var inputs = pane.getElementsByTagName('input');

	for (var i = 0; i < inputs.length; i++)
		if (inputs[i].id === id)
			return inputs[i].value;

	return null;
}

/* 把「每个字段组一块、每条线路一段」的渲染结果改成一个线路一个标签 */
function tabify(mapEl, m) {
	var secs = [];

	for (var i = 0; i < mapEl.children.length; i++)
		if (mapEl.children[i].classList.contains('cbi-section'))
			secs.push(mapEl.children[i]);

	if (secs.length < 1)
		return mapEl;

	var first = secs[0];
	var nlines = 0;

	for (var j = 0; j < first.children.length; j++)
		if (first.children[j].classList.contains('cbi-section-node'))
			nlines++;

	if (nlines < 1)
		return mapEl;

	var panes = {};
	var order = [];

	secs.forEach(function(secEl) {
		var aspect = null;
		var group = [];

		Array.prototype.slice.call(secEl.childNodes).forEach(function(el) {
			if (el.nodeType != 1)
				return;
			if (el.classList.contains('cbi-section-descr') ||
			    el.classList.contains('cbi-section-create'))
				return;

			if (el.tagName == 'H3' && aspect === null) {
				aspect = el.textContent;
				secEl.removeChild(el);
				return;
			}

			if (el.tagName == 'H3')
				el.style.display = 'none';

			group.push(el);

			if (!el.classList.contains('cbi-section-node'))
				return;

			var sid = el.getAttribute('data-section-id');

			if (sid) {
				if (!panes[sid]) {
					panes[sid] = [];
					order.push(sid);
				}
				panes[sid].push(E('h3', {}, aspect || ''));
				group.forEach(function(n) { panes[sid].push(n); });
			}

			group = [];
		});
	});

	var wrap = E('div', { 'class': 'cbi-map-tabbed' });

	order.forEach(function(sid) {
		var pane = E('div', {});
		pane.setAttribute('data-tab', sid);
		panes[sid].forEach(function(n) { pane.appendChild(n); });
		pane.setAttribute('data-tab-title', paneHostname(pane, sid) || uci.get('bestip', sid, 'hostname') || sid);
		wrap.appendChild(pane);
	});

	if (!wrap.firstChild)
		return mapEl;

	var addEl = null;

	for (var k = 0; k < first.children.length; k++)
		if (first.children[k].classList.contains('cbi-section-create'))
			addEl = first.children[k];

	if (addEl)
		first.insertBefore(wrap, addEl);
	else
		first.appendChild(wrap);

	if (addEl)
		first.removeChild(addEl);

	secs.slice(1).forEach(function(el) { mapEl.removeChild(el); });

	ui.tabs.initTabGroup(wrap.childNodes);

	var menu = wrap.previousElementSibling;

	if (menu && menu.classList.contains('cbi-tabmenu'))
		menu.appendChild(E('li', { 'class': 'cbi-tab' },
			E('a', { 'href': '#', 'click': function(ev) {
				ev.preventDefault();
				addLine(m);
			} }, '+')));

	return mapEl;
}

return view.extend({
	load: function() {
		return uci.load('bestip');
	},

	render: function() {
		var m = new form.Map('bestip', _('Best IP'),
			_('每轮抽若干 IP 拨测，与现任比较后再决定是否切换。保存后下一轮生效，不需要重启服务。'));
		var o;

		/* ---------- 基本 ---------- */
		var s = m.section(form.TypedSection, 'bestip', _('基本'));
		s.anonymous = false;
		s.addremove = true;
		s.description = _('每条线路一个标签，点标签分别设置；标签右边的 + 可以新增线路');

		o = s.option(form.Flag, 'enabled', _('启用'));
		o.default = '1';
		o.rmempty = false;
		o.description = _('停用后停止拨测，当前解析保持不变');

		o = s.option(form.Value, 'hostname', _('解析域名'));
		o.description = _('写进 hosts 的名字，例如 nrt.best.host；每条线路一个');

		o = s.option(form.Value, 'target', _('拨测 URL'));
		o.default = 'https://dash.cloudflare.com/favicon.ico';
		o.description = _('用 --resolve 直连候选 IP，SNI 仍是这个域名');

		o = s.option(form.Value, 'interval', _('拨测间隔（秒）'));
		o.datatype = 'uinteger';
		o.default = '600';
		o.description = _('默认 600 秒');

		o = s.option(form.DynamicList, 'pool', _('IP 池'));
		o.description = _('每行一个 /24 或单个 IP，默认三个 Cloudflare 段');

		/* ---------- 探测 ---------- */
		var p = m.section(form.TypedSection, 'bestip', _('探测'));
		p.anonymous = false;

		o = p.option(form.Value, 'sample_new', _('每轮新抽 IP 数'));
		o.datatype = 'uinteger';
		o.default = '8';
		o.description = _('加上现任的 2 个，就是本轮要拨测的 IP 总数');

		o = p.option(form.Value, 'keep', _('保留个数'));
		o.datatype = 'uinteger';
		o.default = '2';

		o = p.option(form.Value, 'rounds', _('每 IP 测量次数'));
		o.datatype = 'uinteger';
		o.default = '5';
		o.description = _('取中位数，建议 5 次');

		o = p.option(form.Value, 'concurrency', _('并发数'));
		o.datatype = 'uinteger';
		o.default = '4';
		o.description = _('建议 4；CPU 较弱时并发过高会影响测量结果');

		o = p.option(form.Value, 'connect_timeout', _('连接超时（秒）'));
		o.datatype = 'uinteger';
		o.default = '3';

		o = p.option(form.Value, 'max_time', _('总超时（秒）'));
		o.datatype = 'uinteger';
		o.default = '5';

		o = p.option(form.Value, 'interface', _('绑定出口网卡'));
		o.description = _('多 WAN / VPN 时填，例如 eth1；留空走默认路由');

		/* ---------- 判决 ---------- */
		var d = m.section(form.TypedSection, 'bestip', _('判决'));
		d.anonymous = false;

		o = d.option(form.Value, 'max_fails', _('允许失败次数'));
		o.datatype = 'uinteger';
		o.default = '1';
		o.description = _('超过就淘汰，默认 1 次');

		o = d.option(form.Value, 'max_latency_ms', _('延迟上限（毫秒）'));
		o.datatype = 'uinteger';
		o.default = '2000';
		o.description = _('握手超过这个值直接淘汰');

		o = d.option(form.Value, 'spread_max_pct', _('波动倍数上限（%）'));
		o.datatype = 'uinteger';
		o.default = '200';
		o.description = _('ping:443 最慢一次 ÷ 中位数，200 表示 2 倍；超过就排到稳定候选之后');

		o = d.option(form.Value, 'switch_margin', _('切换阈值（%）'));
		o.datatype = 'uinteger';
		o.default = '15';
		o.description = _('挑战者要快这么多才考虑换，默认 15');

		o = d.option(form.Value, 'confirm_rounds', _('确认轮数'));
		o.datatype = 'uinteger';
		o.default = '2';
		o.description = _('连续几轮达标才真正切换，默认 2');

		o = d.option(form.Flag, 'noise_guard', _('整轮噪声保护'));
		o.default = '1';
		o.description = _('过半候选同时不稳时跳过本轮判决，也不消耗确认轮数');

		o = d.option(form.Flag, 'prefer_distinct_pool', _('尽量分散到不同 /24'));
		o.default = '1';
		o.description = _('避免两个 IP 落在同一段');

		o = d.option(form.Value, 'distinct_factor', _('分散容忍度（%）'));
		o.datatype = 'uinteger';
		o.default = '150';
		o.description = _('另一条线的 IP 延迟不超过最优的这么多倍才用于分散，默认 150');

		/* ---------- 高级 ---------- */
		var a = m.section(form.TypedSection, 'bestip', _('高级'));
		a.anonymous = false;

		o = a.option(form.Value, 'hosts_file', _('hosts 文件'));
		o.default = '/tmp/bestip.host';
		o.description = _('默认 /tmp/bestip.host（tmpfs）；多条线路共用，只替换本线路的行');

		o = a.option(form.Value, 'state_dir', _('状态目录'));
		o.description = _('留空则用 /tmp/bestip/<解析域名>');

		o = a.option(form.Value, 'fallback_ip', _('兜底 IP'));
		o.description = _('还没探测出结果时先给这个地址，可留空');

		return m.render().then(function(mapEl) {
			return tabify(mapEl, m);
		});
	}
});
