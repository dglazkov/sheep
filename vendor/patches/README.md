# Patches against pi

`vendor/pi` is pi, pinned at the commit named in `.gitmodules` and read for
[the lamb design](../../docs/projects/lamb/design.md). Pi is a dependency,
never a fork: every change lamb needs in pi is one `.patch` file here,
applied by `pnpm patches:apply` after `git submodule update --init`, and
named in [phases.md](../../docs/projects/lamb/phases.md) with its upstream
status. The list is meant to stay short.

A patch is made with `git -C vendor/pi diff > vendor/patches/NNNN-name.patch`
and applies in filename order.
