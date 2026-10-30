'use strict';
'require view';
'require form';
'require rpc';
'require ui';

var callSetup = rpc.declare({ object: 'bestip', method: 'setup', expect: {} });

return view.extend({
	render: function() {
		var m = new form.Map('bestip', _('优选 IP'),
			_('每轮抽若干 IP 拨测，与现任比较后再决定是否切换。保存后下一轮生效，不需要重启服务。'));
		var o;

		/* ---------- 基本 ---------- */
		var s = m.section(form.TypedSection, 'bestip', _('基本'));
		s.anonymous = true;

		o = s.option(form.Flag, 'enabled', _('启用'));
		o.description = _('关闭后停止拨测，当前解析保持不变');

		o = s.option(form.Value, 'hostname', _('解析域名'));
		o.description = _('写进 hosts 的名字，例如 best.local');

		o = s.option(form.Value, 'target', _('拨测 URL'));
		o.description = _('用 --resolve 直连候选 IP，SNI 仍是这个域名');

		o = s.option(form.Value, 'interval', _('拨测间隔（秒）'));
		o.datatype = 'uinteger';
		o.description = _('默认 600 秒');

		o = s.option(form.DynamicList, 'pool', _('IP 池'));
		o.description = _('每行一个 /24 或单个 IP，默认三个 Cloudflare 段');

		/* ---------- 探测 ---------- */
		var p = m.section(form.TypedSection, 'bestip', _('探测'));
		p.anonymous = true;

		o = p.option(form.Value, 'sample_new', _('每轮新抽 IP 数'));
		o.datatype = 'uinteger';
		o.description = _('加上现任的 2 个，就是本轮要拨测的 IP 总数');

		o = p.option(form.Value, 'keep', _('保留个数'));
		o.datatype = 'uinteger';

		o = p.option(form.Value, 'rounds', _('每 IP 测量次数'));
		o.datatype = 'uinteger';
		o.description = _('取中位数，建议 5 次');

		o = p.option(form.Value, 'concurrency', _('并发数'));
		o.datatype = 'uinteger';
		o.description = _('低端路由建议 4，太高会污染测量结果');

		o = p.option(form.Value, 'connect_timeout', _('连接超时（秒）'));
		o.datatype = 'uinteger';

		o = p.option(form.Value, 'max_time', _('总超时（秒）'));
		o.datatype = 'uinteger';

		o = p.option(form.Value, 'interface', _('绑定出口网卡'));
		o.description = _('多 WAN / VPN 时填，例如 eth1；留空走默认路由');

		/* ---------- 判决 ---------- */
		var d = m.section(form.TypedSection, 'bestip', _('判决'));
		d.anonymous = true;

		o = d.option(form.Value, 'max_fails', _('允许失败次数'));
		o.datatype = 'uinteger';
		o.description = _('超过就淘汰，默认 1 次');

		o = d.option(form.Value, 'max_latency_ms', _('延迟上限（毫秒）'));
		o.datatype = 'uinteger';
		o.description = _('握手超过这个值直接淘汰');

		o = d.option(form.Value, 'spread_max_pct', _('波动倍数上限（%）'));
		o.datatype = 'uinteger';
		o.description = _('最慢一次 ÷ 中位数，200 表示 2 倍；超过就排到稳定候选之后');

		o = d.option(form.Value, 'switch_margin', _('切换阈值（%）'));
		o.datatype = 'uinteger';
		o.description = _('挑战者要快这么多才考虑换，默认 15');

		o = d.option(form.Value, 'confirm_rounds', _('确认轮数'));
		o.datatype = 'uinteger';
		o.description = _('连续几轮达标才真正切换，默认 2');

		o = d.option(form.Flag, 'prefer_distinct_pool', _('尽量分散到不同 /24'));
		o.description = _('避免两个 IP 落在同一段');

		o = d.option(form.Value, 'distinct_factor', _('分散容忍度（%）'));
		o.datatype = 'uinteger';
		o.description = _('另一条线的 IP 延迟不超过最优的这么多倍才用于分散，默认 150');

		/* ---------- 高级 ---------- */
		var a = m.section(form.TypedSection, 'bestip', _('高级'));
		a.anonymous = true;

		o = a.option(form.Value, 'hosts_file', _('hosts 文件'));
		o.description = _('默认 /tmp/best.hosts（tmpfs，不磨损闪存）');

		o = a.option(form.Value, 'state_dir', _('状态目录'));
		o.description = _('默认 /tmp/bestip');

		o = a.option(form.Flag, 'dnsmasq_reload', _('写完后 HUP dnsmasq'));
		o.description = _('让新解析立即生效');

		o = a.option(form.Value, 'fallback_ip', _('兜底 IP'));
		o.description = _('还没探测出结果时先给这个地址，可留空');

		if (form.Button) {
			o = a.option(form.Button, '_setup', _('dnsmasq 挂载'));
			o.inputtitle = _('立即挂载');
			o.inputstyle = 'apply';
			o.description = _('把 hosts 文件加入 dnsmasq 的 addnhosts 并重载');
			o.onclick = function() {
				return callSetup().then(function() {
					ui.addNotification(null, E('p', {}, [ _('已挂载，dnsmasq 已重载') ]), 'info');
				});
			};
		}

		return m.render();
	}
});
