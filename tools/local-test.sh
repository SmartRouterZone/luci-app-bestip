#!/bin/sh
#
# 在 Linux / macOS 上免路由器试跑一轮，用来验证拨测和判决逻辑。
# 只写 /tmp，不会碰系统配置。
#
# 用法: ./tools/local-test.sh [轮数]

set -u
cd "$(dirname "$0")/.." || exit 1

ROUNDS=${1:-1}
T=$(mktemp -d /tmp/bestip-test.XXXXXX)
CONF="$T/bestip.conf"

cat > "$CONF" <<EOF
config bestip 'main'
	option enabled '1'
	option interval '60'
	option target 'https://dash.cloudflare.com/favicon.ico'
	option hostname 'best.host'
	option hosts_file '$T/best.hosts'
	option state_dir '$T/state'
	list pool '172.64.229.0/24'
	list pool '162.159.38.0/24'
	list pool '162.159.39.0/24'
	option sample_new '8'
	option keep '2'
	option rounds '3'
	option concurrency '4'
	option dnsmasq_reload '0'
EOF

export BESTIP_NO_UCI=1
export BESTIP_CONF="$CONF"

i=1
while [ "$i" -le "$ROUNDS" ]; do
	echo "===== 第 $i 轮 ====="
	sh root/usr/local/bin/bestip run --force || exit 1
	i=$((i + 1))
done

echo
sh root/usr/local/bin/bestip show
echo
echo "hosts:"
cat "$T/best.hosts" 2>/dev/null
echo
echo "状态: $(sh root/usr/local/bin/bestip status | head -c 200)..."
echo "临时目录: $T"
