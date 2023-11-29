# dotsfile

## create_symlink

```bash
chmod +x ./scripts/create_symlink.sh
```

上記で、シンボリックリンクを作成できる

## win32yank

https://github.com/equalsraf/win32yank

-   win32yank-x64.zip をダウンロード
-   win32yank.exe の取り出す

```bash
sudo mv win32yank.exe /usr/local/bin
sudo chmod +x /usr/local/bin/win32yank.exe
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
