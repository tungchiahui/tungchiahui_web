### 4.3.6 地图读取基本操作

#### 1.准备工作

请先调用如下指令在工作空间的src目录下创建一个功能包：

```
ros2 pkg create mycar_map_server --dependencies nav2_map_server
```

在功能包下，新建launch文件夹，并在CMakeLists.txt中添加如下配置：

```
install(DIRECTORY launch DESTINATION share/${PROJECT_NAME})
```

#### 2.读取地图

使用`map_server`读取地图时，常用的方式有两种，分别是使用终端指令与launch文件集成。两种方式效果一致，都可以以话题的方式发布地图消息。

##### 方式1：终端指令

请在终端下进入工作空间，输入如下指令：

```
ros2 run nav2_map_server map_server --ros-args -p yaml_filename:=map/my_map.yaml
```

由于`map_server`是具有生命周期的节点，所以接下来还需要对节点进行配置和激活，请新开终端执行如下指令：

```
ros2 lifecycle set /map_server configure
ros2 lifecycle set /map_server activate
```

执行完毕若无异常，再调用`ros2 topic list`即可查看到`/map`话题了，说明地图消息已经被发布了。

##### 方式2：launch集成

方式1需要手动设置`map_server`生命周期，步骤稍显繁琐，因此，我们还可以将该节点集成进launch文件，以简化启动步骤。在launch目录下新建名为`map_server.launch.py`的文件，并输入如下内容：

```py
import os
from launch import LaunchDescription
from launch_ros.actions import Node
def generate_launch_description():
  map_file = os.path.join('map', 'my_map.yaml')
  map_server_node = Node(
      package='nav2_map_server',
      executable='map_server',
      name='map_server',
      output='screen',
      parameters=[{'use_sim_time': True},
                  {'yaml_filename':map_file}]
  )
  manager_mapper_node = Node(
    package='nav2_lifecycle_manager',
    executable='lifecycle_manager',
    name='lifecycle_manager_mapper',
    output='screen',
    parameters=[{'use_sim_time': True},
      {'autostart': True},
      {'node_names': ['map_server']}]
  )
  return LaunchDescription([map_server_node,manager_mapper_node])
```

在该文件中，使用了功能包中`nav2_lifecycle_manager`中的`lifecycle_manager`组件，该组件可以自动的配置、激活其所管理的具有生命周期的节点。构建功能包后并执行该launch文件，其最终效果与方式一类似。

#### 3.显示地图

打开rviz2，然后添加Map插件，并将话题设置为/map，并将该话题的`Durability Policy`

选项设置为`Transient Local`，就可以正常显示地图数据了。

![](/assets/4.3.6_地图显示.PNG)

