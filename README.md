# dotsfile

## Install
- ghq https://github.com/x-motemen/ghq
- gh https://github.com/cli/cli

```bash
git clone https://github.com/zsh-users/antigen.git ~/.antigen
```

## create_symlink

```bash
chmod +x ./scripts/create_symlink.sh
```

上記で、シンボリックリンクを作成できる

## xsel
```bash
sudo apt install xsel
```

## WSL-Hello-sudo

https://github.com/nullpo-head/WSL-Hello-sudo

```bash
wget http://github.com/nullpo-head/WSL-Hello-sudo/releases/latest/download/release.tar.gz
tar xvf release.tar.gz
cd release
./install.sh
```

```bash
cd ../
rm -fr ./release.tar.gz ./release
```

## eza
https://github.com/eza-community/eza
A modern, maintained replacement for ls.

## ripgrep
https://github.com/BurntSushi/ripgrep

## Copilot Chat
https://github.com/CopilotC-Nvim/CopilotChat.nvim

- tiktoken というトークンを扱うライブラリを入れている。
/nvim/lua/tittoken_core.so に配置しているのは
https://github.com/gptlang/lua-tiktoken/releases
v0.2.1のtiktoken_core-linux-lua51.soをtiktoken_core.soにリネームして配置している。
