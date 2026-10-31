include $(TOPDIR)/rules.mk

PKG_LICENSE:=MIT

LUCI_TITLE:=LuCI app for Cloudflare optimal IP
LUCI_DESCRIPTION:=Periodically probes Cloudflare edge IPs for each line and publishes the best two to a hosts file.
LUCI_DEPENDS:=+luci-base +curl +ca-bundle +coreutils-od
LUCI_PKGARCH:=all

include ../../luci.mk
