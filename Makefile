include $(TOPDIR)/rules.mk

PKG_LICENSE:=MIT

LUCI_TITLE:=LuCI app for Cloudflare optimal IP
LUCI_DESCRIPTION:=Periodically probes Cloudflare edge IPs and publishes the best two to dnsmasq.
LUCI_DEPENDS:=+luci-base +curl +ca-bundle
LUCI_PKGARCH:=all

include ../../luci.mk
